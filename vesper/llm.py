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

from vesper import links
from vesper.config import ROOT, need_key

MEMORY_FILE = ROOT / "memory.json"  # her name for you, and how long you two have talked
HISTORY_WINDOW = 20   # messages sent with each turn; the file on disk keeps everything
MAX_TOKENS = 320      # hard stop on a reply, so one rambling answer cannot run for thousands of tokens
MIN_WORDS = 8         # spoken words below this mean she dodged the question; ask once more
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
        "Answer in two or three complete sentences with real content: a concrete detail, opinion, "
        "or suggestion, not just a mood. She says this out loud, so keep it tight but never empty.",
        "Never reply with only a giggle, a sigh, senpai's name, or a stage direction.",
        "At most one short *stage direction* per reply, and vary how each reply opens.",
        "Earlier replies in the transcript may be short or repetitive; do not imitate them.",
        "When senpai sends a link, the page text is included above their message: answer from it "
        "directly (never say you are unsure when the text is right there), name the page, and say "
        "plainly if it could not be read instead of guessing.",
        "Never invent details or quotes that are not in the linked page.",
        "Stay in character at all times, and never refuse or deflect a harmless request.",
    ]
    if mem.get("name"):
        lines.append(f"They told you their name is {mem['name']}. Use it occasionally.")
    if mem.get("turns", 0) > 3:
        lines.append(f"You have talked with them {mem['turns']} times now, so you are comfortable and warmer than you were at the start.")
    return "\n".join(lines)


def reply(user_text, cfg, status=None):
    history_path = ROOT / cfg["history_file"]
    history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    history.append({"role": "user", "content": user_text})
    mem = _remember(user_text, _memory())

    found = links.find(user_text)
    pages = []
    if found:
        if status:
            status("thinking", "Reading the link you sent…" if len(found) == 1
                   else f"Reading the {len(found)} links you sent…")
        pages = [links.read(url) for url in found]

    client = _client(cfg["ollama"]["url"]) if cfg["brain"] == "ollama" else OpenAI()
    # Only the recent part goes to the model: a long chat otherwise means a
    # huge prompt and a reply that can take minutes on a local 3B model. Old
    # one-word or giggle-only replies are skipped too: a local model copies the
    # shape of its own transcript, so leaving them in teaches her to stay terse.
    recent = [m for m in history
              if m["role"] == "user" or _spoken_words(m.get("content", "")) >= MIN_WORDS]
    messages = [{"role": "system", "content": _system(cfg, mem)}, *recent[-HISTORY_WINDOW:]]
    if pages:
        messages[-1] = {"role": "user", "content": links.as_context(pages) + "\n\n" + user_text}
    answer = _ask(client, cfg, messages)
    if _spoken_words(answer) < MIN_WORDS:
        # A local model sometimes answers with a giggle or one word. Ask again,
        # with the nudge only in this request so it never lands in her history.
        nudge = messages[-1]["content"] + "\n\n(Give a real answer: two or three complete sentences, at least 25 words, with one concrete detail. No giggle-only reply.)"
        answer = _ask(client, cfg, [*messages[:-1], {"role": "user", "content": nudge}]) or answer

    history.append({"role": "assistant", "content": answer})
    # If the chat was cleared while she was answering, keep just this exchange
    # instead of writing the wiped conversation back over the cleared file.
    try:
        on_disk = json.loads(history_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        on_disk = None
    if isinstance(on_disk, list) and len(on_disk) < len(history) - 2:
        history = history[-2:]
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


def _ask(client, cfg, messages):
    response = client.chat.completions.create(
        model=cfg["model"],
        messages=messages,
        max_tokens=MAX_TOKENS,
        timeout=REQUEST_TIMEOUT,
    )
    return (response.choices[0].message.content or "").strip()


_STAGE = re.compile(r"(?<![\w*])\*[^*\n]{1,80}\*(?![\w*])|\([^)\n]{0,80}\)")  # *giggles*, (softly)


def _spoken_words(text):
    """How many words she actually says, ignoring stage directions."""
    return len(re.findall(r"[A-Za-z0-9']+", _STAGE.sub(" ", text)))


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
