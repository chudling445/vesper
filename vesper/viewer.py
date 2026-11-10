"""Her body: a tiny web server for the avatar page (client/index.html).

The page asks /next four times a second. When a new voice clip is waiting,
it plays it, moves her mouth to it, wears the expression that fits the line,
shows the words, and calls /done when the clip ends, so the chat waits until
she has finished talking.

No page open? The clip plays on your speakers instead.

stop() cuts her off mid-sentence, which is what Enter does while she talks.
"""
import json
import os
import queue
import sys
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import sounddevice as sd
import soundfile as sf

from vesper.config import ROOT

HOST, PORT = "127.0.0.1", 8080  # 127.0.0.1, not localhost: behaves the same on Windows and Linux

_clips = queue.Queue()          # voice clips waiting for the page: {"audio", "mood"}
_finished = threading.Event()   # set when the page says a clip ended
_page_last_seen = float("-inf")  # when the page last asked /next (time.monotonic); never yet
_avatar = None                  # the .vrm file named in character_config.yaml
_stop = threading.Event()       # the page should cut the current clip off
_cut = threading.Event()        # the current play() was cut off
_inbox = None
_cfg = None
_status_lock = threading.Lock()
_runtime_status = {"phase": "starting", "detail": "Starting Vesper…", "updated": time.time()}


def update_status(phase, detail=""):
    with _status_lock:
        _runtime_status.update(phase=phase, detail=detail, updated=time.time())


class _Handler(SimpleHTTPRequestHandler):
    def _local_origin(self):
        if self.client_address[0] not in ("127.0.0.1", "::1"):
            return False
        origin = self.headers.get("Origin")
        return not origin or origin in (f"http://{HOST}:{PORT}", f"http://localhost:{PORT}")

    def _json(self, value, status=200):
        self._send(json.dumps(value, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", status)

    def do_GET(self):
        global _page_last_seen
        if self.path.startswith("/api/") and not self._local_origin():
            return self._json({"error": "This local endpoint only accepts requests from Vesper."}, 403)
        if self.path == "/api/status":
            with _status_lock:
                state = dict(_runtime_status)
            cfg = _cfg or {}
            return self._json({
                **state,
                "character": cfg.get("character_file", "character_config.yaml"),
                "brain": cfg.get("brain", "unknown"),
                "model": cfg.get("model", "unknown"),
                "asr": cfg.get("asr", "unknown"),
                "tts": cfg.get("tts", "unknown"),
                "avatarReady": bool(_avatar and _avatar.is_file()),
                "voiceReady": bool(os.getenv("FISH_API_KEY")) if cfg.get("tts") == "fish" else True,
            })
        if self.path == "/api/history":
            try:
                path = (ROOT / (_cfg or {}).get("history_file", "chat_history.json")).resolve()
                path.relative_to(ROOT.resolve())
                history = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
                if not isinstance(history, list):
                    history = []
                messages = [item for item in history if isinstance(item, dict) and item.get("role") in ("user", "assistant") and isinstance(item.get("content"), str)]
                total = len(messages)
                offset = max(0, total - 300)
                return self._json({"messages": messages[-300:], "total": total, "offset": offset})
            except (OSError, ValueError):
                return self._json({"messages": [], "total": 0, "error": "Conversation history could not be read."}, 500)
        if self.path == "/avatar.vrm":
            return self._send(_avatar.read_bytes(), "application/octet-stream")
        if self.path != "/next":
            return super().do_GET()  # the page and the voice clip, from client/
        _page_last_seen = time.monotonic()
        if _stop.is_set():
            _stop.clear()
            return self._send(json.dumps({"stop": True}).encode(), "application/json")
        try:
            clip = _clips.get_nowait()
        except queue.Empty:
            clip = {"audio": None, "mood": None, "text": None}
        self._send(json.dumps(clip).encode(), "application/json")

    def do_POST(self):
        if not self._local_origin():
            return self._json({"error": "This local endpoint only accepts requests from Vesper."}, 403)
        if self.path == "/api/chat":
            try:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    return self._json({"error": "The message size is invalid."}, 400)
                if length <= 0 or length > 64_000:
                    return self._json({"error": "Message must be under 64 KB."}, 413)
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
                message = payload.get("text", "") if isinstance(payload, dict) else ""
                message = message.strip() if isinstance(message, str) else ""
                if not message:
                    return self._json({"error": "Type a message first."}, 400)
                if _inbox is None:
                    return self._json({"error": "Vesper is still starting."}, 503)
                _inbox.put_nowait(message)
                update_status("queued", "Your message is in line.")
                return self._json({"accepted": True}, 202)
            except queue.Full:
                return self._json({"error": "The message queue is full. Wait for Vesper to finish."}, 429)
            except (UnicodeDecodeError, json.JSONDecodeError):
                return self._json({"error": "That message could not be read."}, 400)
        if self.path == "/api/interrupt":
            stop()
            update_status("ready", "Response stopped.")
            return self._json({"stopped": True})
        if self.path == "/api/voice":
            try:
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    return self._json({"error": "The voice clip size is invalid."}, 400)
                if length <= 0 or length > 25_000_000:
                    return self._json({"error": "Voice clips must be under 25 MB."}, 413)
                audio = self.rfile.read(length)
                from vesper import asr
                stop()  # voice input starts a new turn; stop any reply the user is speaking over
                update_status("transcribing", "Transcribing your voice…")
                media_type = self.headers.get("Content-Type", "audio/webm").split(";", 1)[0].strip().lower()
                extension = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a"}.get(media_type, "webm")
                transcript = asr.transcribe(audio, _cfg, filename=f"you.{extension}", content_type=media_type)
                if not transcript:
                    update_status("ready", "I didn't catch that. Try again.")
                    return self._json({"transcript": "", "accepted": False})
                if _inbox is None:
                    return self._json({"error": "Vesper is still starting."}, 503)
                _inbox.put_nowait(transcript)
                update_status("queued", "Your voice message is in line.")
                return self._json({"transcript": transcript, "accepted": True}, 202)
            except queue.Full:
                return self._json({"error": "The message queue is full. Wait for Vesper to finish."}, 429)
            except Exception as error:
                update_status("error", "Speech recognition failed.")
                return self._json({"error": f"Speech recognition failed: {type(error).__name__}."}, 500)
        if self.path == "/done":
            _finished.set()
            return self._send(b"{}", "application/json; charset=utf-8")
        self.send_error(404)

    def end_headers(self):
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob: https://cdn.jsdelivr.net; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
        super().end_headers()

    def _send(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # keep the terminal readable


def start(cfg, inbox=None, open_browser=True):
    global _avatar, _cfg, _inbox
    _cfg, _inbox = cfg, inbox
    _avatar = ROOT / cfg["vrm_model"]
    if not _avatar.exists():
        sys.exit(f"[setup] Avatar not found: {_avatar}. Check vrm_model in character_config.yaml.")
    try:
        server = ThreadingHTTPServer((HOST, PORT), partial(_Handler, directory=str(ROOT / "client")))
    except OSError:
        sys.exit(f"[setup] Port {PORT} is busy (is Vesper already running?). Close it or change PORT in vesper/viewer.py.")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[viewer] avatar: {cfg['vrm_model']}")
    print(f"[viewer] avatar page: http://{HOST}:{PORT}  (open it, then click once)")
    update_status("ready", "Ready when you are.")
    if open_browser:
        webbrowser.open(f"http://{HOST}:{PORT}")


def begin_turn():
    """Clear cancellation state once, before a new reply starts generating."""
    _cut.clear()
    _stop.clear()


def interrupted():
    return _cut.is_set()


def play(wav_path, mood="happy", text=None):
    """Play her voice on the avatar page, or the speakers if no page is open.

    mood picks the expression she wears while saying it (see llm.mood), and
    text is the subtitle. Returns True if she finished, False if cut off.
    """
    if _cut.is_set():
        return False
    duration = sf.info(wav_path).duration
    # Determine if avatar page is actively being used
    page_active = time.monotonic() - _page_last_seen < 2
    if page_active:
        if _cut.is_set():
            return False
        _finished.clear()
        # ?v= so the browser never replays the old clip
        _clips.put({"audio": f"audio/{wav_path.name}?v={time.time()}", "mood": mood, "text": text})
        # Wait for the page to acknowledge, but allow long generation times
        if not _finished.wait(timeout=duration + 20):
            print("[viewer] page timeout; carrying on anyway")
    else:
        print("[viewer] no avatar page open, playing on speakers")
        data, sample_rate = sf.read(wav_path)
        sd.play(data, sample_rate)
        sd.wait()
    return not _cut.is_set()


def stop():
    """Cut her off right now, on the page or on the speakers. play() returns False."""
    _cut.set()
    if time.monotonic() - _page_last_seen < 2:
        _stop.set()  # the page picks this up within a quarter second
    else:
        sd.stop()
    _finished.set()
