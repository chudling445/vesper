"""Her brain: send the chat so far to a model and get her reply.

brain: ollama -> a model on your PC, served by Ollama (free, private, no key)
brain: openai -> OpenAI's API, needs OPENAI_API_KEY in .env

The chat is saved to history_file after every turn, so she remembers it
next time. Delete that file to start fresh.
"""
import json
import re
import sys

import requests
from openai import OpenAI

from vesper.config import ROOT, need_key

MEMORY_FILE = ROOT / "memory.json"  # her name for you, and how long you two have talked
HISTORY_WINDOW = 20   # messages sent with each turn; the file on disk keeps everything
MAX_TOKENS = 220      # hard stop on a reply, so one rambling answer cannot run for thousands of tokens
REQUEST_TIMEOUT = 300  # seconds; a cold Ollama load can take a minute on a slow disk


def check(cfg):
    if cfg["brain"] == "openai":
        need_key("OPENAI_API_KEY", f"the LLM, model {cfg['model']}")
        return
    url = cfg["ollama"]["url"]
    try:
        tags = requests.get(f"{url}/api/tags", timeout=5).json()
    except requests.ConnectionError:
        sys.exit(f"[setup] Ollama is not running at {url}. Start the Ollama app, "
                 "or use --brain openai.")
    installed = [m["name"] for m in tags.get("models", [])]
    if cfg["model"] not in installed and f"{cfg['model']}:latest" not in installed:
        have = ", ".join(installed) if installed else "none yet"
        sys.exit(f"[setup] Ollama does not have the model '{cfg['model']}' (installed: {have}). "
                 f"Run: ollama pull {cfg['model']}")
    print(f"[brain] Ollama at {url}, model {cfg['model']}")


def _memory():
    """{"turns": how many times you have talked, "name": what she calls you}."""
    try:
        return json.loads(MEMORY_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"turns": 0, "name": None}


def _remember(user_text, mem):
    found = re.search(r"\b(?:my name is|call me)\s+([A-Za-z][\w'-]{1,20})", user_text, re.I)
    if found:
        mem["name"] = found.group(1).capitalize()
    mem["turns"] = mem.get("turns", 0) + 1
    try:
        MEMORY_FILE.write_text(json.dumps(mem, indent=2), encoding="utf-8")
    except OSError:
        pass
    return mem


def _system(cfg, mem):
    """Her personality, plus the house rules that keep her in character."""
    lines = [
        cfg["system_prompt"].strip(),
        "Answer in one or two short sentences. She says them out loud, so long replies are slow and tiring.",
        "Stay in character at all times, and never refuse or deflect a harmless request.",
    ]
    if mem.get("name"):
        lines.append(f"They told you their name is {mem['name']}. Use it occasionally.")
    if mem.get("turns", 0) > 3:
        lines.append(f"You have talked with them {mem['turns']} times now, so you are comfortable and warmer than you were at the start.")
    return "\n".join(lines)


def reply(user_text, cfg):
    history_path = ROOT / cfg["history_file"]
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    history.append({"role": "user", "content": user_text})
    mem = _remember(user_text, _memory())

    client = _client(cfg["ollama"]["url"]) if cfg["brain"] == "ollama" else OpenAI()
    response = client.chat.completions.create(
        model=cfg["model"],
        # Only the recent part goes to the model: a long chat otherwise means a
        # huge prompt and a reply that can take minutes on a local 3B model.
        messages=[{"role": "system", "content": _system(cfg, mem)}, *history[-HISTORY_WINDOW:]],
        max_tokens=MAX_TOKENS,
        timeout=REQUEST_TIMEOUT,
    )
    answer = (response.choices[0].message.content or "").strip()

    history.append({"role": "assistant", "content": answer})
    history_path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")
    return answer


# Her face: which expression a reply should wear. First mood with a matching
# phrase wins. Every mood here has matching weights in client/index.html.
_MOODS = [
    ("angry", ("hmph", "baka", "idiot", "shut up", "glare", "annoying", "tch", "pout")),
    ("sad", ("*sighs*", "lonely", "i'm sorry", "i am sorry", "cry", "sad")),
    ("shy", ("blush", "embarrass", "kyaa", "fluster", "pervert", "don't look")),
    ("surprised", ("wow", "whoa", "no way", "really?", "*gasps*", "*gasp*", "?!", "!!")),
    ("excited", ("yay", "excited", "*bounces*", "can't wait", "let's go", "amazing", "woohoo")),
    ("smug", ("obviously", "smirk", "naturally", "as expected", "of course i")),
    ("happy", ("haha", "hehe", "giggle", "*winks*", "love", "cute", "great")),
]


def mood(answer):
    """The expression she wears while saying this: happy, shy, angry, and so on."""
    low = answer.lower()
    for name, phrases in _MOODS:
        if any(p in low for p in phrases):
            return name
    return "happy"  # her resting face is a small smile, not a blank stare


def _client(url):
    """Ollama speaks the OpenAI API under /v1 and ignores the key."""
    return OpenAI(base_url=f"{url}/v1", api_key="ollama")


if __name__ == "__main__":
    # One test message: uv run python -m vesper.llm   (add --openai to try OpenAI)
    from vesper.config import load_config
    cfg = load_config()
    if "--openai" in sys.argv:
        cfg["brain"] = "openai"
    check(cfg)
    print("Vesper:", reply("Hi! Say something short.", cfg))
