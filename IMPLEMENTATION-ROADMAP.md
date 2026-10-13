# Vesper systems implementation status

This is a grounded status and delivery order for the larger Vesper architecture request. It distinguishes existing repository capabilities from work completed in the latest milestone; it is not a claim that every requested subsystem is complete. Status is based on a source-level pass over the current checkout, not a full security, accessibility, or feature audit.

## Current delivery

- **Unified site and desktop presentation — implemented in `36081f4`.** The existing vanilla-JavaScript pages share theme tokens, navigation styling, and the selectable Aurora Glass palette. The desktop windows use the same app pages and shared stylesheet.
- **Local state reliability and encrypted backups — improved in recent milestones.** Existing state uses IndexedDB with a localStorage startup cache/fallback. IndexedDB writes are serialized, startup hydration no longer replaces a state changed after hydration began, and restores are migrated through the versioned state schema. Users can create and restore a passphrase-encrypted AES-GCM backup in Workspace → Cloud Sync. Encryption applies only to the exported file; it does not encrypt live browser storage or provide biometric access control.
- **Health estimates and logs — extended in this milestone.** The existing optional energy-estimate calculator now refuses to silently substitute Mifflin–St Jeor when Katch–McArdle is selected without valid body-fat data. A user-entered daily calorie/macronutrient log and an optional fasting elapsed-time log are stored locally. Values are manual estimates, not clinical guidance.
- **Focused checks — added in this milestone.** Regression tests cover serialized writes, write-queue recovery, hydration race selection, energy formulas, nutrition validation/aggregation, and fasting elapsed-time validation.
- **Hosted-context privacy — tightened in this milestone.** Matching workspace notes and long-term memories are now omitted from hosted-provider requests unless an explicit local setting is enabled. Local Ollama can still receive those on-device context snippets. Persona instructions and recent conversation messages remain part of the request to the selected model provider.

## Existing capabilities found; wider acceptance still needs verification

| Area | Current repository baseline | Remaining work |
|---|---|---|
| Local-first platform | Versioned app state, IndexedDB, localStorage fallback, service worker, local Ollama option, serialized writes, and encrypted file backup/restore | Cross-window conflict semantics, crash recovery, quota UX, biometric unlock, encryption at rest, and broader offline acceptance |
| Model routing | Local Ollama and configured OpenAI, Anthropic, xAI, and OpenAI-compatible providers | Provider-by-provider integration tests, clearer routing/privacy review, streaming and cancellation UX |
| Character profiles | JSON and PNG character-card import/export with bounded parsing and lorebook support | Broader compatibility fixtures, explicit consent and prompt-injection boundaries, round-trip tests |
| Memory | Local IndexedDB fact store, edit/pin/delete, sensitive-string checks, relevant-context retrieval | Relationship graph and provenance, review controls for inferred facts, stronger privacy/retention model |
| Avatar and motion | Bundled Three.js/VRM loader, expressions, spring-bone updates, gestures, orbit and model controls | Full editor-quality VRM 1.0 asset/animation workflows, compatibility matrix, performance and motion-capture features |
| Voice | Browser TTS, speech input where supported, audio analyser, approximate phoneme and audio visemes | Voice-provider choices, device/browser matrix, accessibility controls, measured latency and quality checks |
| PC and markets | Offline part profiles, source-attributed observations, optional configured feeds, calculations and explicit data gaps | Coverage is not a complete verified 2020-to-current Indian price archive; feed availability and permission are user/source dependent |
| Finance | Local assets, quote snapshots, accounts, ledger, budgets, EMI calculations, and market-stress observations | Broader financial-planning workflows, reconciliation/import paths, and a documented audit of calculation edge cases |
| Health | Energy estimates, manual nutrition/macronutrient entries, and optional fasting timer logs | Hydration and nutrient reference features, trends/export, data-retention controls, and a dedicated health-safety/accessibility review |
| Arcade | A sizable offline set of original games and toys documented in `ARCADE.md` | The requested 80-game target is not met or independently counted/accepted; add only original, licensed, offline modules with lifecycle tests |
| Privacy vault | AES-GCM passphrase-encrypted backup export/restore; no application-level encryption at rest or biometric unlock | Threat model, optional recoverable encryption at rest, migration/key recovery UX, and cross-browser/WebAuthn feasibility review |

The project intentionally does not scrape protected retailer or financial pages, fabricate historical observations, or represent market-stress indicators as crash probabilities. Optional live data remains dependent on a permitted source and its actual publication schedule.

## Ordered next implementation phases

1. **State and privacy foundations:** add deterministic tests around the full store adapter and migrations; harden cross-window writes, quota handling, and backup/restore compatibility. Treat biometric/WebAuthn unlock and encryption at rest as separate designs with recovery and data-loss safeguards, not as properties of the encrypted backup export.
2. **Memory and model workflows:** formalize fact provenance, review/forget/retention behavior, then add a graph representation and provider-routing integration tests without sending local context to hosted providers unless explicitly enabled.
3. **Avatar and voice acceptance:** publish a tested VRM 1.0 compatibility matrix and lifecycle tests for model import, expressions, spring bones, authored motion, audio playback, cancellation, and reduced-motion/accessibility behavior.
4. **Data-backed planning:** identify permitted public or user-configured data sources, attach provenance and timestamps to every observation, test compatibility/calculation boundaries, and clearly preserve unknown periods instead of filling them with invented values.
5. **Health expansion:** keep manual estimates separate from authoritative nutrition data; define source/licensing, opt-in storage, export/deletion, and safety requirements before adding nutrient databases or recommendations.
6. **Arcade expansion:** inventory actual registered modules and acceptance coverage, then add original games in tested batches. Do not embed or reproduce protected game-site code or assets to meet a numeric count.
7. **Release acceptance:** verify all routes, desktop profiles, offline cache updates, keyboard/screen-reader flows, responsive layouts, storage migrations, and installer payloads against one release checklist.

No migration to React, Vite, or Tailwind is proposed: the current shipped application is a vanilla-JavaScript/Node application, and the separate `ui-kit` is optional rather than the runtime.
