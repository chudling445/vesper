# Vesper mobile companion

Vesper remains the product name. The current mobile path is a desktop-hosted companion: the Windows computer runs the local server, Ollama/provider, model files, and full VRM avatar; an Android browser connects to that Vesper instance over the same Wi-Fi. This avoids pretending that a full local LLM and desktop-quality VRM runtime have already been packaged into a small APK.

## Start it

Run **Start Vesper Mobile Companion.bat**. Choose a private password with at least 16 characters. The launcher binds Vesper to the local network, prints the phone URL, and opens the desktop copy. On Android, open that URL in Chrome or another Chromium browser, sign in with the password, then choose **Add to Home screen** or **Install app**. Vesper's existing manifest and service worker provide the installable PWA shell.

The LAN mode is intentionally opt-in. Normal Vesper still listens only on localhost. Do not port-forward the LAN port to the public internet. For internet access, use a properly configured HTTPS reverse proxy and the existing public-mode requirements.

## What runs where

The desktop hosts the AI provider, conversation state, VRM model, animation controller, and audio integrations. The phone is a touch-friendly client. The full 3D stage is available in the browser, but performance depends on the phone GPU. The desktop-hosted architecture is the reliable way to preserve the same model and local provider behavior across devices.

## Separate AI model status

Vesper now has a distinct Scholar-Linux persona layer and an original regression seed set. A genuinely new trained model is not included yet. The `training/` directory contains the source registry, provenance rules, and seed data for a later licensed fine-tuning run. It does not scrape or redistribute arbitrary copyrighted web pages.
