"""Loads character_config.yaml (or character_<name>.yaml) and the API keys from .env."""
import os
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent  # the project folder
load_dotenv(ROOT / ".env")


def load_config(character=None):
    """The default is character_config.yaml; --character eve reads character_eve.yaml."""
    path = ROOT / (f"character_{character}.yaml" if character else "character_config.yaml")
    if not path.exists():
        others = sorted(p.stem.removeprefix("character_") for p in ROOT.glob("character_*.yaml")
                        if p.name != "character_config.yaml")
        sys.exit(f"[setup] No {path.name}. Available characters: {', '.join(others) or 'none'}")
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    cfg["character_file"] = path.name
    return cfg


def need_key(name, why):
    """Stop at startup with a clear message if an API key is missing."""
    if not os.getenv(name):
        sys.exit(f"[setup] {name} is missing. Add it to .env (needed for {why}).")
    print(f"[setup] {name} found ({why})")
