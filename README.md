# pre-consultation-starter
## README — Editing the schema safely

* Change wording/options by editing the `SCHEMA` object at the top of `app.js`.
* To add a question: create a new object in `questions` and point a previous question’s `next` to its `id`.
* Branching: set `next` to a function that returns the destination `id` based on the answer (see `referral_reason`).
* Types available now: `text`, `slider`, `single` (one choice), `multi` (many choices), `ocular_dominance` (with a beta webcam helper), and the automatic `review` panel.
* Your data: stays in the browser (`localStorage`) until Submit → JSON is shown for copy/download.

**Next features (easy to add later):**

* A consent/clinician handoff page to send to a Google Sheet (via Apps Script) or Supabase.
* Multi‑language toggle; text‑to‑speech for prompts; larger fonts toggle.
* Error logging + clinician summary PDF.
* Stronger ocular dominance via landmarks (later, not needed for MVP).
