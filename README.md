# Pre‑Consultation Website (Schema‑Driven MVP)

A minimal, accessibility‑first questionnaire for cataract & glaucoma clinics. **One question per page**, large tap targets, keyboard friendly. The **questionnaire lives in `schema.json`** so you can edit wording/options/flow without touching code.

> Live hosting: GitHub Pages (public). Local preview: VS Code **Live Server**.

---

## Folder layout
pre-consultation-starter/ ├─ index.html       # main page (loads app.js) ├─ styles.css       # large fonts, big buttons, high contrast ├─ app.js           # renders UI + fetches schema.json └─ schema.json      # QUESTIONS + FLOW (edit this file)
---

## Editing the questionnaire (`schema.json`)
- Open **`schema.json`** and edit labels/options.
- Add new steps under `questions` and update the previous step’s `next`.
- **Types:** `text`, `slider`, `single`, `multi`, `ocular_dominance`, `review`.
