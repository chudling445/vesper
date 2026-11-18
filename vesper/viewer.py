"""Her body: a tiny web server for the avatar page (client/index.html).

The page asks /next four times a second. When a new voice clip is waiting,
it plays it, moves her mouth to it, wears the expression that fits the line,
shows the words, and calls /done when the clip ends, so the chat waits until
she has finished talking.

No page open? The clip plays on your speakers instead.

stop() cuts her off mid-sentence, which is what Enter does while she talks.
"""
import gzip
import json
import mimetypes
import os
import queue
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import sounddevice as sd
import soundfile as sf

from vesper.config import ROOT

HOST, PORT = "127.0.0.1", 8080  # 127.0.0.1, not localhost: behaves the same on Windows and Linux
HTTPS_PORT = 8443                # phones only give a page the microphone over https
TLS_DIR = ROOT / ".tls"          # generated once, never served, never committed
_lan = False                     # --mobile: serve the page to phones on the same Wi-Fi
_pairing = ""                    # the key the printed phone link carries
_owner = ""                      # the page that currently gets her voice
_owner_seen = 0.0                # when that page last asked for a clip
_owner_lock = threading.Lock()

mimetypes.add_type("application/manifest+json", ".webmanifest")

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


def _origin_ok(client_ip, origin, host_header, site):
    """Who may drive her: this machine always, and on --mobile only her own page.

    Browsers label every request with Sec-Fetch-Site and send Origin on writes, so a
    page on another site cannot drive her even though the port is open on the LAN.
    Same-origin is compared against the Host the browser actually used, which keeps
    both the http and the https copies working.
    """
    if site and site not in ("self", "same-origin", "none"):
        return False
    if client_ip not in ("127.0.0.1", "::1") and not _lan:
        return False
    if not origin:
        return True
    if not host_header:
        return False
    parts = urlsplit(origin)
    return parts.scheme in ("http", "https") and parts.netloc == host_header


def _lan_addresses():
    """The addresses a phone on the same Wi-Fi can use, best effort."""
    found = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("10.255.255.255", 1))  # no packet is sent for UDP connect
            found.add(probe.getsockname()[0])
    except OSError:
        pass
    return sorted(ip for ip in found if ip and not ip.startswith(("127.", "169.254.")))


def _claim(client, now=None):
    """Which page should hear her now.

    Two windows polling at once used to race for each clip, so her voice could come
    out of the PC while you were holding the phone. The page that most recently asked
    keeps it; if that page goes quiet for five seconds, the next one asking takes over.
    """
    global _owner, _owner_seen
    moment = time.monotonic() if now is None else now
    with _owner_lock:
        if not _owner or moment - _owner_seen > 5:
            _owner, _owner_seen = client, moment
        if client == _owner:
            _owner_seen = moment
            return True
        return False


def _take_voice(client):
    """Speaking from a page hands it the audio for this turn."""
    global _owner, _owner_seen
    with _owner_lock:
        _owner, _owner_seen = client, time.monotonic()


def _pairing_key():
    """One key per installation, reused across restarts so a phone only pairs once."""
    note = TLS_DIR / "pairing.txt"
    if note.is_file():
        existing = note.read_text(encoding="utf-8").strip()
        if existing:
            return existing
    key = secrets.token_urlsafe(12)
    TLS_DIR.mkdir(exist_ok=True)
    note.write_text(key, encoding="utf-8")
    return key


def _openssl():
    """openssl ships with Git for Windows and every Linux; look where it hides."""
    for candidate in ("openssl", r"C:\Program Files\Git\usr\bin\openssl.exe", r"C:\Program Files\Git\bin\openssl.exe"):
        if shutil.which(candidate) or (os.path.isabs(candidate) and os.path.isfile(candidate)):
            return candidate
    return None


def _ensure_cert(addresses):
    """A self-signed certificate for this computer's addresses, generated once.

    It is not a real certificate authority, so the phone warns the first time;
    after that the page counts as secure and the microphone is allowed.
    """
    wanted = ["127.0.0.1"] + list(addresses)
    cert, key = TLS_DIR / "cert.pem", TLS_DIR / "key.pem"
    note = TLS_DIR / "addresses.txt"
    if cert.is_file() and key.is_file() and note.is_file() and note.read_text(encoding="utf-8").split() == wanted:
        return True
    openssl = _openssl()
    if not openssl:
        return False
    TLS_DIR.mkdir(exist_ok=True)
    san = ",".join(["DNS:localhost"] + [f"IP:{ip}" for ip in wanted])
    try:
        subprocess.run(
            [openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "3650",
             "-keyout", str(key), "-out", str(cert), "-subj", "/CN=Vesper",
             "-addext", f"subjectAltName={san}"],
            check=True, capture_output=True, timeout=40,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    note.write_text("\n".join(wanted), encoding="utf-8")
    return True


class _Handler(SimpleHTTPRequestHandler):
    def _client(self):
        return self.headers.get("X-Vesper-Client", "") or f"anon:{self.client_address[0]}"

    def _key_given(self):
        key = self.headers.get("X-Vesper-Key", "")
        if not key:
            key = (parse_qs(urlsplit(self.path).query).get("k") or [""])[0]
        if not key:
            for part in self.headers.get("Cookie", "").split(";"):
                name, _, value = part.strip().partition("=")
                if name == "vesper_key":
                    key = value
                    break
        return key

    def _unpaired(self):
        """A phone that found the port without the printed link gets a sentence, not JSON."""
        if self.path.startswith("/api/") or "text/html" not in self.headers.get("Accept", ""):
            return self._json({"error": "Use the Vesper link printed in its terminal to open this page."}, 401)
        page = (
            "<!doctype html><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            "<title>Vesper</title><body style=\"margin:0;display:grid;place-items:center;min-height:100vh;"
            "background:#191321;color:#f5effb;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px\">"
            "<div><h1 style=\"font-weight:400\">Vesper is private</h1>"
            "<p style=\"color:#c4b5d1\">Open the link printed in the Vesper terminal on the PC that runs her."
            "<br>It carries this installation's pairing key.</p></div></body>"
        )
        return self._send(page.encode("utf-8"), "text/html; charset=utf-8", 401)

    def _paired(self):
        """Loopback is always trusted; a phone needs the key printed in the terminal.

        Being on the same Wi-Fi is not permission to drive her: without this, anyone
        who opens the port could read the chat, clear it, or have her talk.
        """
        if not _lan or self.client_address[0] in ("127.0.0.1", "::1"):
            return True
        if not _pairing:
            return True
        return secrets.compare_digest(self._key_given(), _pairing)

    def _local_origin(self):
        return _origin_ok(
            self.client_address[0],
            self.headers.get("Origin"),
            self.headers.get("Host"),
            self.headers.get("Sec-Fetch-Site"),
        )

    def _json(self, value, status=200):
        self._send(json.dumps(value, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", status)

    def do_GET(self):
        global _page_last_seen
        if _lan and _pairing and self.client_address[0] not in ("127.0.0.1", "::1"):
            key = (parse_qs(urlsplit(self.path).query).get("k") or [""])[0]
            if key and secrets.compare_digest(key, _pairing):
                self.send_response(303)
                self.send_header("Location", "/")
                self.send_header("Set-Cookie", f"vesper_key={key}; Path=/; Max-Age=31536000; SameSite=Lax")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        if not self._paired():
            return self._unpaired()
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
            return self._avatar_response()
        if self.path != "/next":
            return super().do_GET()  # the page and the voice clip, from client/
        _page_last_seen = time.monotonic()
        if _stop.is_set():
            _stop.clear()
            return self._send(json.dumps({"stop": True}).encode(), "application/json")
        if not _claim(self._client()):
            return self._send(json.dumps({"audio": None, "mood": None, "text": None, "owner": False}).encode(), "application/json")
        try:
            clip = _clips.get_nowait()
        except queue.Empty:
            clip = {"audio": None, "mood": None, "text": None}
        self._send(json.dumps({**clip, "owner": True}).encode(), "application/json")

    def do_POST(self):
        if not self._paired():
            return self._unpaired()
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
                _take_voice(self._client())
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
                if length <= 0 or length > 8_000_000:
                    return self._json({"error": "Voice clips must be under 8 MB."}, 413)
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
                _take_voice(self._client())
                update_status("queued", "Your voice message is in line.")
                return self._json({"transcript": transcript, "accepted": True}, 202)
            except queue.Full:
                return self._json({"error": "The message queue is full. Wait for Vesper to finish."}, 429)
            except Exception as error:
                update_status("error", "Speech recognition failed.")
                return self._json({"error": f"Speech recognition failed: {type(error).__name__}."}, 500)
        if self.path == "/api/clear":
            return self._clear()
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
        encoding = None
        if (len(body) >= 1024 and "gzip" in self.headers.get("Accept-Encoding", "")
                and any(kind in content_type for kind in ("json", "text", "javascript", "svg"))):
            body = gzip.compress(body, 6)
            encoding = "gzip"
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        if encoding:
            self.send_header("Content-Encoding", encoding)
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        if self.path == "/avatar.vrm":
            if not self._paired():
                return self._unpaired()
            return self._avatar_response()
        return super().do_HEAD()

    def _avatar_response(self):
        """Her model is ~19 MB. Let the browser keep it and revalidate with one small
        request, stream it in chunks, and accept Range so a dropped phone download can
        resume instead of starting over."""
        if not _avatar or not _avatar.is_file():
            return self._json({"error": "The avatar file is missing."}, 404)
        info = _avatar.stat()
        etag = f'"{info.st_mtime_ns:x}-{info.st_size:x}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "public, max-age=86400, must-revalidate")
            self.end_headers()
            return
        start, end, status = 0, info.st_size - 1, 200
        requested = self.headers.get("Range", "")
        if_range = self.headers.get("If-Range")
        if requested.startswith("bytes=") and (if_range is None or if_range == etag):
            part = requested[6:].split(",", 1)[0].strip()
            try:
                first, _, last = part.partition("-")
                if first:
                    start = max(0, int(first))
                    end = min(info.st_size - 1, int(last)) if last else info.st_size - 1
                elif last:
                    start = max(0, info.st_size - int(last))
                else:
                    raise ValueError
                if start > end or start >= info.st_size:
                    raise ValueError
                status = 206
            except ValueError:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{info.st_size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("ETag", etag)
        self.send_header("Cache-Control", "public, max-age=86400, must-revalidate")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{info.st_size}")
        self.end_headers()
        if self.command == "HEAD":
            return
        remaining = length
        try:
            with _avatar.open("rb") as handle:
                handle.seek(start)
                while remaining > 0:
                    chunk = handle.read(min(262_144, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            return  # the phone walked away; nothing to clean up

    def _clear(self):
        """Empty the saved conversation, so the next turn starts fresh."""
        try:
            path = (ROOT / (_cfg or {}).get("history_file", "chat_history.json")).resolve()
            path.relative_to(ROOT.resolve())
            path.write_text("[]\n", encoding="utf-8")
        except (OSError, ValueError):
            return self._json({"error": "The conversation could not be cleared."}, 500)
        stop()  # cut off anything she is saying right now
        update_status("ready", "Chat cleared.")
        return self._json({"cleared": True})

    def log_message(self, *args):
        pass  # keep the terminal readable


def start(cfg, inbox=None, open_browser=True, mobile=False):
    global _avatar, _cfg, _inbox, _lan, _pairing
    _cfg, _inbox, _lan = cfg, inbox, mobile
    _pairing = _pairing_key() if mobile else ""
    _avatar = ROOT / cfg["vrm_model"]
    if not _avatar.exists():
        sys.exit(f"[setup] Avatar not found: {_avatar}. Check vrm_model in character_config.yaml.")
    try:
        server = ThreadingHTTPServer(("0.0.0.0" if mobile else HOST, PORT), partial(_Handler, directory=str(ROOT / "client")))
    except OSError:
        sys.exit(f"[setup] Port {PORT} is busy (is Vesper already running?). Close it or change PORT in vesper/viewer.py.")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"[viewer] avatar: {cfg['vrm_model']}")
    print(f"[viewer] avatar page: http://{HOST}:{PORT}  (open it, then click once)")
    if mobile:
        addresses = _lan_addresses()
        print("[viewer] mobile mode: phones on this Wi-Fi can open the page. Stop Vesper to close it.")
        for address in addresses:
            print(f"[viewer] on your phone: http://{address}:{PORT}/?k={_pairing}  (typing, her voice, her model)")
        if addresses and _ensure_cert(addresses):
            try:
                secure = ThreadingHTTPServer(("0.0.0.0", HTTPS_PORT), partial(_Handler, directory=str(ROOT / "client")))
                context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                context.load_cert_chain(str(TLS_DIR / "cert.pem"), str(TLS_DIR / "key.pem"))
                secure.socket = context.wrap_socket(secure.socket, server_side=True)
                threading.Thread(target=secure.serve_forever, daemon=True).start()
                for address in addresses:
                    print(f"[viewer] with the microphone: https://{address}:{HTTPS_PORT}/?k={_pairing}")
                print("[viewer] the phone warns about the self-signed certificate once: Advanced -> proceed.")
            except (OSError, ssl.SSLError):
                print(f"[setup] https port {HTTPS_PORT} is unavailable; the microphone link is off.")
        else:
            print("[viewer] openssl was not found, so the https/microphone link is off. Typing still works.")
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
