# Project Vesper ✿

Project Vesper is an anime-focused LLM companion project. She chats in a snarky-but-sweet anime voice, calls you "senpai", and appears as a large 3D VRM avatar that emotes and lip-syncs while she talks. It runs on your own PC: local chat through Ollama by default, or OpenAI / any OpenAI-compatible API if you prefer. Inspired by [Project Riko](https://github.com/rayenfeng/riko_project).

**Runs on Windows with Node.js (the Windows setup installs Node.js for you if it is missing).**

## ✨ Features

- 💬 **LLM-based dialogue** using Ollama (local), the OpenAI API, or any OpenAI-compatible API
- 🧠 **Conversation memory** — recent messages are kept on this computer and sent with every request
- 📁 **Clean YAML-based config** for personality: `character_config.yaml`
- 🧍 **3D VRM avatar** with ten blended expressions, orbit, zoom, and word-timed lip sync
- 🔊 **Voice** through the speech voices installed in Windows (Auto Speak, pace, and pitch controls)
- ♟️ **Offline chess** against Vesper — no model or internet needed
- 🌸 **Anime themes** — Sakura Senpai (default), Mica Night, Velvet, Petal, Moonstone, and Jade. Press **T** to cycle.
- 🔒 **Private by default** — the server only listens on `127.0.0.1`

## ⚙️ Configuration

Vesper's personality lives in `character_config.yaml`:

```
character_name: Vesper
user_nickname: senpai
presets:
  default:
    system_prompt: |
      You are Vesper, an adult, anime-inspired femboy romantic companion...
      Have the snarky, sassy attitude of an anime character...
      Always call the user "senpai"...
modes:
  playful: "For this reply, lean into snarky comebacks..."
  tender: "For this reply, drop most of the sass..."
  thoughtful: "For this reply, lean into reflective curiosity..."
```

Edit the prompts, save, and restart Vesper. If the file is missing, the same personality built into `server.mjs` is used.

Model and provider settings live in `.env` (copy `.env.example`), or pick them in **LLM Settings** inside the app. Keep `.env` private — it can contain API keys.

## 🛠️ Setup

### Install on Windows

Build the Windows installer by running `installer\build-installer.ps1` in PowerShell, then run the generated `Vesper-Setup.exe`. Setup installs the app per user, installs Node.js through Windows Package Manager if needed, offers to import a VRM, and creates a desktop shortcut. Ollama and chat model weights are downloaded separately; they are not bundled in the setup.

### Install a chat model

```
ollama pull llama3.2
```

Install [Ollama](https://ollama.com/download/windows), download any chat model, then pick it in **LLM Settings** and press **Save Model**. Online providers (OpenAI or compatible) need credentials in `.env`, and they send your recent messages to that provider.

## 🧪 Usage

- Double-click **Start Vesper.bat** to open the local site in your browser.
- The desktop shortcut (**Start Vesper Desktop.bat**) opens an app-style window with Chrome or Edge when available.
- Keep the minimized server and Ollama windows running while you chat.

The flow:

1. You type in the box (or tap a starter question) and press **Enter**
2. Vesper's personality prompt and your recent history are sent to the selected model
3. The model's reply appears in the chat
4. **Auto Speak** reads it aloud with your chosen voice
5. The avatar changes expression and her lips follow the spoken words

## 🎭 Character, voice, and controls

- Avatar files are not included in this repository because the current model's export permissions prohibit redistribution. Import a VRM you are permitted to use with the app.
- Drag to turn the model, scroll or use the zoom slider to frame it, choose **Orbit** for a slow turn, and **Reset View** to start over.
- Choose from ten expressions below the model, and set Vesper's moment (**Playful**, **Tender**, **Thoughtful**) to change how she answers.
- Voice availability depends on the voices installed in Windows. Lip sync follows speech word timing; it is expressive, not phoneme-perfect.
- Theme, chat history, model choice, voice options, zoom, and orbit settings are kept on this computer.
- Open **Chess** in the conversation header for a private match. Choose a side and one of three strengths.

### Update the avatar

To use your own avatar, export a VRM you are permitted to distribute or use, then import it through the app. The viewer libraries are bundled in `vendor`, so displaying the model needs no CDN or internet connection.

The VRM was exported with Creator set to **Unspecified**. Its current export permissions are personal use, non-commercial, redistribution prohibited, alteration prohibited, and attribution required. Check the VRM metadata in VRoid Studio before sharing the model.

## 🔐 Network and privacy

The Windows install runs on this PC and defaults to Ollama on `127.0.0.1`. Local chats stay on the PC. OpenAI and compatible modes send recent messages to the provider you select. Keys stay in `.env` and are never put in the page. The Windows installer restricts `.env` permissions to your Windows account, Administrators, and SYSTEM. Do not commit or share it.

Vesper uses an affectionate romantic-companion roleplay voice while remaining clear that she is an AI character. The desktop app window uses a separate browser profile beside the app, so its chat and settings stay in this project folder.

For a concise setup guide, see [GETTING-STARTED.md](GETTING-STARTED.md). For a password-protected online preview, see [DEPLOYMENT.md](DEPLOYMENT.md). The online template excludes the current VRM because its export settings prohibit redistribution.

## 📌 TODO / Future Improvements

- [x] GUI or web interface
- [x] VRM model frontend
- [ ] Neural voice synthesis (Project Riko uses GPT-SoVITS)
- [ ] Microphone push-to-talk with speech recognition (Project Riko uses Faster-Whisper)
- [ ] Emotion or tone control that picks expressions from the reply

## 🧑‍🎤 Credits

- Project style and persona inspiration: [Project Riko](https://github.com/rayenfeng/riko_project) by Just Rayen
- 3D viewer: [three.js](https://threejs.org) and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- Avatar made in [VRoid Studio](https://vroid.com/en/studio)
- Local language models via [Ollama](https://ollama.com)
