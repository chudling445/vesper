"""Talk to Vesper: press Enter and just talk, or type. She answers out loud on the avatar page.

    your voice -> asr.py -> text -> llm.py -> her reply -> tts.py -> her voice -> viewer.py -> avatar

Run:  uv run main.py                     (brain / ears / voice from character_config.yaml)
      uv run main.py --character eve     (reads character_eve.yaml instead)
      uv run main.py --tts fish          (override the voice)
      uv run main.py --asr groq          (override the ears)
      uv run main.py --brain openai      (override the brain)
"""
import argparse
import queue
import re
import threading
from pathlib import Path

from vesper import asr, llm, tts, viewer
from vesper.config import load_config


def sentences(text):
    """Her reply, cut into speakable pieces, so the first one plays while the next is generated."""
    parts = [p for p in re.split(r"(?<=[.!?\u2026])\s+", text.strip()) if p]
    lines = []
    for part in parts:
        if lines and len(lines[-1]) + len(part) < 48:  # keep tiny fragments with their sentence
            lines[-1] += " " + part
        else:
            lines.append(part)
    return lines or [text]


def say(answer, cfg):
    """Speak a reply line by line. False if the user cut her off. Each next clip is
    generated while the current one is playing, so she starts talking much sooner."""
    lines = sentences(answer)
    mood = llm.mood(answer)
    current = {"path": None, "error": None}

    def synth(line, slot, result):
        try:
            result["path"] = tts.speak(line, cfg, slot)
        except Exception as error:
            result["error"] = error

    current_worker = threading.Thread(target=synth, args=(lines[0], 0, current), daemon=True)
    current_worker.start()

    for i, line in enumerate(lines):
        current_worker.join()
        if current["error"]:
            raise current["error"]
        if not current["path"]:
            raise RuntimeError("Voice generation returned no audio file.")
        if viewer.interrupted():
            Path(current["path"]).unlink(missing_ok=True)
            return False

        next_result, next_worker = None, None
        if i + 1 < len(lines):
            next_result = {"path": None, "error": None}
            next_worker = threading.Thread(target=synth, args=(lines[i + 1], (i + 1) % 2, next_result), daemon=True)
            next_worker.start()  # prepare the next line while this one is playing

        current_path = current["path"]
        try:
            finished = viewer.play(current_path, mood, line)
        finally:
            Path(current_path).unlink(missing_ok=True)
        if not finished:
            if next_worker:
                def discard_prefetch():
                    next_worker.join()
                    if next_result and next_result["path"]:
                        Path(next_result["path"]).unlink(missing_ok=True)
                threading.Thread(target=discard_prefetch, daemon=True).start()
            return False
        if next_worker:
            current, current_worker = next_result, next_worker
    return True


def listen(inbox, talking, done):
    """Reads the console forever. Empty Enter = talk (she stops when you pause),
    typed text = that message, and either one while she is talking cuts her off."""
    while not done.is_set():
        print("\nPress ENTER to talk, or type a message: ", end="", flush=True)
        try:
            line = input()
        except (EOFError, KeyboardInterrupt):
            done.set()
            inbox.put(None)
            return
        if talking.is_set():
            viewer.stop()  # cut her off mid-sentence
            if line.strip():
                inbox.put(line.strip())
            continue
        if line.strip():
            inbox.put(line.strip())
        else:
            inbox.put(("voice", asr.listen()))


def main():
    parser = argparse.ArgumentParser(description="Talk to Vesper.")
    parser.add_argument("--character", help="read character_<name>.yaml instead of character_config.yaml")
    parser.add_argument("--brain", choices=["ollama", "openai"], help="the LLM (overrides the config)")
    parser.add_argument("--asr", choices=["local", "groq"], help="speech to text (overrides the config)")
    parser.add_argument("--tts", choices=["sovits", "fish"], help="her voice (overrides the config)")
    parser.add_argument("--console", action="store_true", help="also accept messages in this terminal")
    parser.add_argument("--no-browser", action="store_true", help="start the local avatar page without opening a browser")
    args = parser.parse_args()

    cfg = load_config(args.character)
    cfg["brain"] = args.brain or cfg["brain"]
    cfg["asr"] = args.asr or cfg["asr"]
    cfg["tts"] = args.tts or cfg["tts"]

    print(f"\n=== Vesper  |  {cfg['character_file']}  |  brain: {cfg['brain']} ({cfg['model']})"
          f"  |  ears: {cfg['asr']}  |  voice: {cfg['tts']} ===")
    llm.check(cfg)
    asr.check(cfg)
    tts.check(cfg)
    inbox, talking, done = queue.Queue(maxsize=20), threading.Event(), threading.Event()
    viewer.start(cfg, inbox, open_browser=not args.no_browser)
    if args.console:
        threading.Thread(target=listen, args=(inbox, talking, done), daemon=True).start()
        print("[chat] ENTER listens until you pause | type to send text | ENTER while she talks cuts her off")
    else:
        print("[chat] Use the Vesper page to type, talk, or interrupt.")

    while True:
        try:
            item = inbox.get()
        except KeyboardInterrupt:
            print("\nBye!")
            return
        if item is None:
            print("\nBye!")
            return
        try:
            viewer.begin_turn()
            if isinstance(item, tuple):
                if not item[1]:
                    continue
                viewer.update_status("transcribing", "Turning your speech into text…")
                text = asr.transcribe(item[1], cfg)
            else:
                text = item
            if viewer.interrupted():
                viewer.update_status("ready", "Request stopped.")
                continue
            if not text:
                print("(heard nothing, try again)")
                viewer.update_status("ready", "I didn't catch that. Try again.")
                continue
            print(f"You:  {text}")
            viewer.update_status("thinking", "Preparing a reply…")
            talking.set()
            try:
                answer = llm.reply(text, cfg, status=viewer.update_status)
                if viewer.interrupted():
                    print("(response cancelled)")
                    viewer.update_status("ready", "Response stopped.")
                    continue
                print(f"Vesper: {answer}")
                viewer.update_status("speaking", "Speaking…")
                finished = say(answer, cfg)
                viewer.update_status("ready", "Response stopped." if not finished else "Ready when you are.")
            finally:
                talking.clear()
            if not finished:
                print("(cut off — go ahead)")
        except Exception as e:  # one bad turn should not end the chat
            print(f"[error] {type(e).__name__}: {e}")
            viewer.update_status("error", f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
