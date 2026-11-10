"""Her ears: record your voice (push-to-talk) and turn it into text.

asr: local -> Faster-Whisper on your PC
asr: groq  -> Groq's online Whisper
"""
import io
import os

import numpy as np
import sounddevice as sd
import soundfile as sf
from faster_whisper import WhisperModel
from openai import OpenAI

from vesper.config import need_key

SAMPLE_RATE = 16000                # what Whisper expects
WHISPER_MODEL = "base.en"          # bigger = more accurate, slower: small.en, medium.en
WHISPER_DEVICE = "cpu"             # "cuda" for an NVIDIA GPU (needs CUDA + cuDNN)
GROQ_MODEL = "whisper-large-v3-turbo"

_whisper = None  # Faster-Whisper model, loaded once by check()


def check(cfg):
    global _whisper
    if cfg["asr"] == "groq":
        need_key("GROQ_API_KEY", "asr: groq")
    else:
        print(f"[asr] loading Faster-Whisper {WHISPER_MODEL} on {WHISPER_DEVICE} (first run downloads it)...")
        _whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type="int8")


def ask():
    """Press ENTER to talk, or type a line and press ENTER to send it as text instead.

    Returns that text, or WAV bytes if you chose to speak (None if nothing was captured).
    """
    line = input("\nPress ENTER to talk, or type a message: ").strip()
    if line:
        return line  # typed: no microphone, no transcription
    return _record()


def record():
    """Push-to-talk on its own (used by the test at the bottom). Returns WAV bytes, or None."""
    input("\nPress ENTER to talk...")
    return _record()


def listen(silence=0.9, max_seconds=20):
    """Hands-free: record until you stop talking. Returns WAV bytes, or None.

    The room's noise floor is measured first, so a quiet mic and a noisy room
    both work without touching any numbers.
    """
    block = int(SAMPLE_RATE * 0.1)  # 100 ms per read
    chunks, quiet_from, heard_anything = [], None, False
    print("Listening... (just talk, she stops when you pause)", flush=True)
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32") as stream:
        room = [stream.read(block)[0] for _ in range(4)]  # ~0.4s of the room
        floor = max(0.004, float(np.mean([np.sqrt(np.mean(b ** 2)) for b in room])) * 2.5)
        while len(chunks) * 0.1 < max_seconds:
            data, _ = stream.read(block)
            chunks.append(data.copy())
            loud = float(np.sqrt(np.mean(data ** 2))) > floor
            heard_anything = heard_anything or loud
            if loud:
                quiet_from = None
            elif quiet_from is None:
                quiet_from = len(chunks)
            elif (len(chunks) - quiet_from) * 0.1 > silence and sum(len(c) for c in chunks) > 0:
                break  # a real pause after speech
            if not heard_anything and len(chunks) * 0.1 > 8:
                print("[asr] heard nothing at all (check the microphone)")
                return None
    if not heard_anything:
        return None
    audio = np.concatenate(chunks)
    print(f"[asr] recorded {len(audio) / SAMPLE_RATE:.1f}s", flush=True)
    wav = io.BytesIO()
    sf.write(wav, audio, SAMPLE_RATE, format="WAV")
    return wav.getvalue()


def _record():
    """Enter to start, Enter to stop. Returns WAV bytes, or None if nothing was recorded."""
    chunks = []
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32",
                        callback=lambda data, *_: chunks.append(data.copy())):
        input("Recording... press ENTER to stop")
    if not chunks:
        return None
    audio = np.concatenate(chunks)
    print(f"[asr] recorded {len(audio) / SAMPLE_RATE:.1f}s")
    wav = io.BytesIO()
    sf.write(wav, audio, SAMPLE_RATE, format="WAV")
    return wav.getvalue()


def transcribe(wav_bytes, cfg, filename="you.wav", content_type="audio/wav"):
    if cfg["asr"] == "groq":
        groq = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")
        text = groq.audio.transcriptions.create(
            model=GROQ_MODEL,
            file=(filename, wav_bytes, content_type),
        ).text
    else:
        segments, _ = _whisper.transcribe(io.BytesIO(wav_bytes))
        text = "".join(s.text for s in segments)  # each segment already starts with a space
    return text.strip()


if __name__ == "__main__":
    # Talk into your mic and see what she hears: uv run python -m vesper.asr
    from vesper.config import load_config
    cfg = load_config()
    check(cfg)
    print("You said:", transcribe(record(), cfg))
