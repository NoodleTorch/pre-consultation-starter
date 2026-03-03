# Pre‑Consultation Website (Schema‑Driven MVP)

A minimal, accessibility‑first questionnaire for cataract & glaucoma clinics.

## Project layout

- `index.html` — main page.
- `app.js` — questionnaire flow + submit logic.
- `config.js` — frontend Supabase config (project URL + publishable key).
- `schema.json` — questionnaire content and flow.
- `supabase/functions/submit/index.ts` — Supabase Edge Function for secure submission.

## Frontend Supabase configuration

Set values in `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
};
```

- `SUPABASE_URL` should be your Supabase project URL.
- `SUPABASE_PUBLISHABLE_KEY` should be your public anon/publishable key.
- **Do not put `SERVICE_ROLE_KEY` in frontend code.** It is server-only.

## Edge Function deploy/update

The submit function lives at `supabase/functions/submit/index.ts` and expects these secrets:

- `PROJECT_URL`
- `SERVICE_ROLE_KEY`
- `CLINIC_SUBMIT_CODE`

Typical update flow:

```bash
supabase functions deploy submit
```

If needed, set or update secrets first:

```bash
supabase secrets set PROJECT_URL=... SERVICE_ROLE_KEY=... CLINIC_SUBMIT_CODE=...
```

After deploy, frontend submits to:

```text
${SUPABASE_URL}/functions/v1/submit
```

## Submission data format

Submitted records now store both:

- `answers` — raw machine-readable values captured from the questionnaire.
- `answers_display` — human-readable labels derived from `schema.json` options (or raw values for non-option inputs).
