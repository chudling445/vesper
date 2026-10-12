# Runtime test matrix

Use a real Windows browser and a VRM at `models/character.vrm`.

| Area | Test | Pass condition |
| --- | --- | --- |
| Server | Start with `Start Vesper Desktop.bat` | Desktop browser opens and `/api/health` returns `{ ok: true }` |
| Transparent window | Run `Start Vesper Model Only.bat` | Model-only page opens, canvas has alpha, floor/grid/platform are hidden, and selected backdrop is visible behind the avatar |
| Expression | Click Neutral, Shy, Fond, Teasing, Surprised | Supported VRM expressions blend smoothly; unsupported buttons become disabled with a clear title |
| Blush | Click Blush and speak with Auto React on | Blush/embarrassed face fades in and out without snapping |
| Lip-sync | Enable Auto Speak and send a reply | `setAvatarSpeechWord` updates mouth vowel shapes while speech is active; speech stops cleanly and mouth returns to idle |
| Voice | Open Voice Lab | Only curated Anime Waifu profile is exposed; fallback works when no preferred voice is installed |
| Games | Play Reflex, Star Catch, and High-Low | Scores update locally and Vesper reacts at milestones/final result |
| Installer | Run `Vesper-Setup.exe` | Setup copies all routes/scripts/vendor files, preserves `.env`, optionally copies VRM, and creates a desktop shortcut |

If Node.js, a browser, speech synthesis, or a VRM is unavailable, run the static checker and label runtime checks as blocked rather than passing them by assumption.
