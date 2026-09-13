# Sonu Marketing — Loans by the Sea

Static demonstration website for Sonu Marketing Private Limited (trade name: Brahma Finance).

- `index.html`: landing page, calculator, company contacts, policy directory and lending platforms.
- `styles.css`: responsive typography and layout.
- `app.js`: calculator, guide and ambient audio.
- `speech.js`: cancellation-safe narration and ocean/music volume coordination.
- `narration.js`: fixed English and Hindi narration text.
- `ananya-en-*.mp3` / `ananya-hi-*.mp3`: fixed Indian English and Hindi recordings generated from those scripts with Google TTS (India locale). No visitor answers are sent for speech generation.

Serve this directory with a static HTTP server. Deploy from the `master` branch to the existing Vercel project.

Company and policy sources, reviewed 13 September 2026:
- https://www.brahmafinance.in/
- https://www.brahmafinance.in/privacy-policy
- https://www.brahmafinance.in/lending-service-providers

The policy directory links to official documents. Five policy titles have no document links on the official directory and therefore offer a request-copy email link. The calculator is illustrative, excludes processing fees and taxes, and does not approve loans or accept applications. The currently unused `script.js` is retained from the original repository.
