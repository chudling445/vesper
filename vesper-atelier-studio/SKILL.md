---
name: vesper-atelier-studio
description: Improve, test, and package a local Windows LLM companion studio with a VRM avatar, anime-style voice, facial expressions, lip-sync, transparent Model Only mode, offline-first persistence and sync, privacy lock, onboarding, habit tracking, themed backdrops, mini-games, and a one-click installer. Use when modifying this Vesper project or a similar local 3D chatbot desktop/site experience.
---

# Vesper Atelier Studio

## Overview

Use this workflow to extend a local-first 3D chatbot without breaking desktop launch, offline routes, avatar performance, or installer packaging. Prefer small, reversible edits and validate the same files used by both the website and the Windows launcher.

## Workflow

1. **Inspect before editing**
   - Read `AGENTS.md` files from the workspace root down; if none exist, continue.
   - Inspect `index.html`, `styles.css`, `app.js`, `avatar.js`, `server.mjs`, `model-only.html`, `model-only.js`, `games.html`, `games.js`, `voice-utils.js`, launch `.bat` files, and `installer/` scripts.
   - Check available runtimes before promising a live test. Node.js is required for the local server; browser speech and VRM loading require a browser.

2. **Preserve the shared contract**
   - Keep routes registered in `server.mjs`, `manus-routes.json`, and `sw.js` in sync.
   - Keep new files in both installer arrays: `installer/build-installer.ps1` and `installer/Install-Vesper.ps1`.
   - Keep Model Only transparent: `THREE.WebGLRenderer({ alpha: true })`, transparent clear color, hidden floor/grid/platform, and CSS-only backdrop layers.
   - Store adjustable preferences in the versioned `appStore` schema; use localStorage as startup fallback and IndexedDB as durable local storage.
   - Register every new module in `server.mjs`, `sw.js`, and both installer payload arrays.

3. **Offline-first and sync**
   - Treat local CRUD as authoritative while offline. Emit `vesper-state-change` for mutations and let `offline-sync.js` coalesce path updates into a bounded queue.
   - Show `OFFLINE READY`, `OFFLINE MODE`, or queued-sync state visibly; never block capture, board moves, exports, or onboarding on network access.
   - Flush only on `online` or a bounded interval. Use HTTPS endpoints and bearer authentication for optional sync; do not claim cross-device cloud backup without a real compatible service and recovery policy.
   - Test offline by disconnecting the network, creating/editing/deleting items, reloading, reconnecting, and confirming the queue remains safe until an endpoint accepts it.

4. **Privacy and security**
   - Use `security-lock.js` for local PIN/master-password hashing, auto-lock inactivity, Ctrl/Cmd+Shift+L, and optional WebAuthn. Keep lock state separate from data persistence.
   - Explain that a UI lock protects access on the device; it is not transparent data encryption. Use Web Crypto, never store plaintext credentials, and never send local PINs to a server.
   - For cloud sync, require a user-supplied HTTPS endpoint and authenticated token. Never invent a hosted identity provider or silently upload personal data.

5. **Onboarding and habits**
   - Keep first run to three steps: use case, three curated starter templates, and a skippable 30-second tour. Set an explicit completion key only after templates are seeded.
   - Track lightweight local events (`checkins`, `notes`, `tasks`) in the workspace schema. Render a restrained heat map and milestone badges; avoid noisy notifications or public rankings.

6. **Avatar, voice, and lip-sync**
   - Use `window.setAvatarExpression`, `window.setAvatarPerformance`, `window.setAvatarSpeaking`, and `window.setAvatarSpeechWord` as the integration points.
   - Keep speech selection curated through `voice-utils.js`; do not expose the full installed voice list when the product asks for Anime Waifu mode.
   - Treat browser Speech Synthesis as approximate lip-sync: vowel/word timing drives mouth shapes, while VRM expression support varies by model. Report unsupported expressions instead of pretending they work.
   - For runtime testing, use a real VRM in `models/character.vrm`, a working browser, and speech synthesis. Verify idle blink, speech mouth movement, blush/expressions, and transparent Model Only rendering separately.

7. **Themes and model backdrops**
   - Use CSS background presets on `#scene` and `.model-only-stage`; keep the canvas alpha-transparent so the same preset works in Model Only mode.
   - Persist one shared backdrop key and synchronize `aria-pressed` state on every preset button.
   - Keep background controls behind the model canvas but above the stage surface.

8. **Offline games with character reactions**
   - Add games as a tab, panel, score branch, state object, and URL hash option.
   - Persist only lightweight scores locally.
   - Call the shared `say()` helper on starts, milestones, wins, losses, and final scores so Vesper reacts in real time.
   - Keep each game dependency-free and playable without Ollama or internet access.

9. **Installer and desktop delivery**
   - Build with `powershell -NoProfile -ExecutionPolicy Bypass -File .\\installer\\build-installer.ps1` from the project root.
   - Verify `Vesper-Setup.exe` exists and has a fresh timestamp.
   - Ensure the installer payload copies the complete route/script list, `vendor`, `models`, `.env.example`, onboarding, Quick Capture, security/sync modules, and standard, Model Only, and Quick Capture launchers.
   - Never bundle `.env` secrets or user VRM files.

## Validation

Run `scripts/verify-vesper.ps1` from the project root. If Node is available, run `node --check app.js`, `node --check avatar.js`, `node --check server.mjs`, `node --check offline-sync.js`, `node --check security-lock.js`, start the server, then request `/api/health`, `/`, `/start`, `/workspace`, `/quick-capture`, `/model-only`, `/games`, and `/api/settings`. If Node is unavailable, complete static checks and clearly report the limitation.

For visual verification, check the full studio and Model Only window at desktop and narrow widths. In Model Only, confirm the page background is transparent outside the selected backdrop, the avatar remains visible, controls work, and the window does not fall back into the main chat route.

## Non-negotiable safeguards

- Do not hard-code API keys or copy `.env` into the installer.
- Do not silently replace a user's selected model; give an actionable missing-model message.
- Do not claim facial-expression or lip-sync quality was runtime-tested when no VRM/browser/runtime was available.
- Keep user-created models, settings, and desktop profile data intact during packaging.
- When producing a demo script, describe the companion as **Astolfo-inspired in energy and styling** unless the user supplies rights or an official integration. Do not claim official affiliation, copy a named actor’s voice, or redistribute copyrighted avatar assets.
