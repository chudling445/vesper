# Vesper's model in the Vesper app

The app itself is called Vesper. Its code is the public Project Riko GitHub snapshot (MIT, commit `3ac7a9253e5da2fc525d98c3ca942c8042b95410`), not the separately described Patreon Desktop App or private full-source edition. The original Riko license is retained in `LICENSE`.

Vesper's exported model remains at `models/character.vrm`; its editable VRoid source remains at `model.vroid`. `character_config.yaml` points the viewer to the exported VRM. The original sample avatar was not retained; the public sample voice and other repository files were copied as requested.

## Run

1. Install Python 3.11+ and `uv` (see the README).
2. Her brain is local by default (`brain: ollama`, model `llama3.2`): install [Ollama](https://ollama.com), run `ollama pull llama3.2` once, and leave the Ollama app running. `FISH_API_KEY` in `.env` covers the voice. For OpenAI instead, add `OPENAI_API_KEY` and set `brain: openai`.
3. Run `Start Vesper.bat` or, from a terminal, `uv run main.py --tts fish`.
4. Open `http://127.0.0.1:8080` and click the page once to enable audio. Use the terminal to press Enter, talk, then press Enter to stop — or type a message and press Enter to send text without the mic.

Local models live in `llm-models/` because `OLLAMA_MODELS` points there (user environment variable); Ollama's default store was copied into it so `llama3.2` is found.

If you prefer local GPT-SoVITS, start its local API and run `uv run main.py --tts sovits`. The copied public sample voice is configured for that mode.

## Character model permissions

The locally supplied `models/character.vrm` is personal project content, not an app release asset. Its embedded VRM metadata specifies `avatarPermission: onlyAuthor`, `commercialUsage: personalNonProfit`, `allowRedistribution: false`, `modification: prohibited`, and disallows political or religious use, excessive violence, and excessive sexual use. Keep this file and `model.vroid` out of published packages and repositories. The app code can be released separately; use a model whose license permits redistribution if a downloadable avatar is needed. The model file itself has not been changed.

The metadata links to the [VRM Public License 1.0](https://vrm.dev/licenses/1.0/). Its actual settings are embedded in the VRM, so review those values before any public distribution or streamed model use.

## Backup

Before the Riko files were replaced, a full verified backup was made at `D:\Downloads\llm project-backup-before-riko-20261107-2346`. It includes the old source, `.git`, private `.env`, model, and ignored data.
