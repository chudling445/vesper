# Changelog

## 1.1.0 — 2026-11-09

Captions, and a chat that stays quick as the history grows.

### Subtitles on the avatar page

- Spoken lines appear as captions, with each word lighting up in time with the real audio clock. Word timing is weighted by word length and punctuation, so short and long words both get a fair share of the line.
- Roleplay actions (`*smiles*`, `*sighs*`) and Markdown are removed before display, so captions read like speech. Bold text keeps its words instead of disappearing.
- Pipelined sentences no longer flicker between clips: the caption stays up until the next line actually starts, then the turn-end signal holds the last line for the configured time.
- Your own voice messages are captioned as “You” with their transcript while she thinks.
- Interrupting clears the caption immediately; a failed clip no longer leaves text on screen.
- Screen readers get the line once through a polite live region instead of hearing every highlighted word.
- Fixed a flash where the whole line appeared already spoken before the browser knew the clip length.

### Chat

- Only the last 20 messages are sent to the model with each turn. The full conversation is still saved to `chat_history.json`, but long histories no longer produce huge prompts and multi-minute replies.
- Replies are capped at 220 tokens, so one rambling answer cannot run away into thousands of tokens (and a long synthesized clip).

### Packaging

- Project version bumped to 1.1.0.
- Local development workspace (`.work/`) is ignored by git.

## 1.0.0

Initial local build: push-to-talk voice or typed chat, Faster-Whisper or Groq speech recognition, Ollama or OpenAI replies, GPT-SoVITS or Fish Audio voice, and a VRM avatar with lip sync, expressions, gestures and camera controls.
