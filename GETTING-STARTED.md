# Vesper — Get started

Vesper is a private chat app with a large 3D VRM character, expressive face blends, gentle body motion, and optional spoken replies.

## Start Vesper on Windows

1. Double-click `Vesper-Setup.exe`, choose an install folder, and keep **Create a Vesper desktop shortcut** selected.
2. For private local chat, install Ollama and download a chat model in the Ollama app. Alternatively, add an online provider key in the private `.env` file beside Vesper.
3. Open Vesper from the desktop shortcut. Its welcome card shows whether your selected chat model is ready.
4. If prompted, select **Choose a model**, tap one of the installed model names, and press **Save Model**. If Ollama is not set up yet, use **Get Ollama** and follow the short guide.
5. Type a message or tap a starter question. Press **Enter** to send and **Shift + Enter** for a new line.

The app download does not include Ollama, chat-model weights, or the VRM character. Setup can import your VRM; Ollama and a chat model are downloaded separately so the installer stays manageable.

The server listens on this computer only by default. The chat, 3D viewer, and browser voice use local files; Ollama chat stays on this computer. If you select OpenAI or another hosted provider, the recent messages are sent to that provider and its key stays in the server’s `.env` file.

## Make Vesper feel right

- Pick one of the ten expression blends under the stage. The face eases into the new look.
- Choose **Playful**, **Tender**, or **Thoughtful** to shift Vesper’s response style, resting expression, head motion, and speaking gestures.
- The arms hang down while Vesper is idle. Small style-specific gestures appear during spoken replies.
- Choose a Windows voice and turn on **Auto Speak** for speech, facial reactions, and word-timed lip movement.
- Drag the model to turn it, scroll to zoom, and use **Orbit** or **Reset View** for framing.
- Press **T** to cycle the color themes.

The model’s export contains five underlying emotion shapes. Vesper combines and blends those shapes into ten selectable looks; a model with more face shapes can provide more distinct expressions. The lip movement follows spoken-word timing and is expressive, not phoneme-perfect.

## Change the avatar

Keep the editable `.vroid` source as your backup. Export your VRoid model as a VRM and save it as `models\character.vrm`. The app does not need an internet connection to load it. Review the VRM export’s usage and redistribution permissions before sharing the model or putting it on a public site.

## Take Vesper online

The included deployment template runs Vesper behind a password gate. You need a hosting account, a hosted model provider (or a model server reachable from that host), and a unique random password of at least 32 characters. The host cannot reach Ollama on your home PC automatically. This is a private preview setup; it does not provide accounts or DDoS protection.

Follow [DEPLOYMENT.md](DEPLOYMENT.md). Never commit `.env`, provider keys, the `.vroid` source, local model weights, or a VRM whose terms do not permit online distribution.
