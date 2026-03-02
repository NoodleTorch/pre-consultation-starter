  // app.js — schema-driven questionnaire engine (no framework)
  // Loads schema.json, renders one question per page, supports branching via
  //  - next: "id"
  //  - next: { when: { answerValue: "id", ... }, default: "id" }
  //  - next: { byAnswerOf: "<prevQuestionId>", map: { value: "id", ... }, default: "id" }
  // Stores answers in localStorage until submit.
  
  (function () {
    const APP_CONFIG = window.APP_CONFIG || {};
    const SCHEMA_URL = 'schema.json';
    const STORE_KEY = 'preconsult_answers_v1';
    const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
    const SUPABASE_PUBLISHABLE_KEY = APP_CONFIG.SUPABASE_PUBLISHABLE_KEY || '';

    // Placeholder image (generic) for options like A5_drops when no brand image provided
    const PLACEHOLDER_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='110' viewBox='0 0 160 110'>
      <rect width='100%' height='100%' fill='#eeeeee'/>
      <rect x='20' y='20' width='120' height='70' fill='none' stroke='#bbbbbb' stroke-width='2'/>
      <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, Helvetica, sans-serif' font-size='12' fill='#888888'>insert image here</text>
    </svg>`;
    const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(PLACEHOLDER_SVG);
  
    // DOM refs
    const el = {
      form: document.getElementById('form'),
      qwrap: document.getElementById('questionContainer'),
      next: document.getElementById('nextBtn'),
      back: document.getElementById('backBtn'),
      progressBar: document.getElementById('progressBar'),
  
      review: document.getElementById('review'),
      reviewBack: document.getElementById('reviewBackBtn'),
      reviewSubmit: document.getElementById('submitBtn'),
      reviewContent: document.getElementById('reviewContent'),
      reviewStatus: document.getElementById('reviewStatus'),

      submitted: document.getElementById('submitted'),
      submittedMessage: document.getElementById('submittedMessage'),
      output: document.getElementById('output'),
      copy: document.getElementById('copyBtn'),
      download: document.getElementById('downloadBtn'),
      restart: document.getElementById('restartBtn'),
    };
  
    const app = {
      schema: null,
      currentId: null,
      // Visited path to support Back (stack of question ids)
      stack: [],
      // Answers object: { [id]: value }
      answers: loadAnswers(),
      clinicCode: null,
    };
  
    // Bootstrap
    fetch(SCHEMA_URL, { cache: 'no-store' })
      .then(r => r.json())
      .then(schema => {
        app.schema = schema;
        const start = schema.start || Object.keys(schema.questions)[0];
        goTo(start, false);
        wireNav();
      })
      .catch(err => {
        renderError('Failed to load questionnaire. Please refresh.');
        console.error(err);
      });
  
    function loadAnswers() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) { return {}; }
    }
    function saveAnswers() {
      localStorage.setItem(STORE_KEY, JSON.stringify(app.answers));
    }
  
    function wireNav() {
      el.next.addEventListener('click', onNext);
      el.back.addEventListener('click', onBack);
      el.reviewBack.addEventListener('click', onReviewBack);
      el.reviewSubmit.addEventListener('click', onSubmit);
      el.copy.addEventListener('click', onCopy);
      el.download.addEventListener('click', onDownload);
      el.restart.addEventListener('click', onRestart);
    }
  
    function onNext() {
      const q = getQ(app.currentId);
      if (!q) return;
  
      const ans = readAnswer(q);
      if (!validate(q, ans)) return; // show inline error if needed
  
      app.answers[q.id] = ans;
      saveAnswers();
  
      const nextId = getNextId(q.id, ans);
      if (!nextId) {
        // fallback to review if no next
        return showReview();
      }
      // push current id to stack before moving forward
      app.stack.push(q.id);
      goTo(nextId, true);
    }
  
    function onBack() {
      if (!app.stack.length) return;
      const prevId = app.stack.pop();
      goTo(prevId, false);
    }
  
    function onReviewBack() {
      // Return to last question visited
      if (app.stack.length) {
        const last = app.stack.pop();
        showForm();
        goTo(last, false);
      } else {
        // If somehow empty, go to start
        showForm();
        goTo(app.schema.start, false);
      }
    }
  
    function onCopy() {
      el.output.select();
      document.execCommand('copy');
    }
  
    function onDownload() {
      const blob = new Blob([el.output.value], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'preconsult-answers.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  
    function onRestart() {
      localStorage.removeItem(STORE_KEY);
      app.answers = {};
      app.stack = [];
      app.clinicCode = null;
      setSubmitStatus('');
      showForm();
      goTo(app.schema.start, false);
    }

    async function onSubmit() {
      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        setSubmitStatus('error', 'Supabase config is missing. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.');
        return;
      }

      if (!app.clinicCode) {
        const enteredCode = window.prompt('Enter your clinic code to submit your responses:');
        if (!enteredCode || !enteredCode.trim()) {
          setSubmitStatus('error', 'A clinic code is required to submit.');
          return;
        }
        app.clinicCode = enteredCode.trim();
      }

      const payload = {
        clinic_code: app.clinicCode,
        schema_version: getSchemaVersion(),
        answers: app.answers,
        meta: {
          tz_offset_minutes: new Date().getTimezoneOffset(),
          submitted_from: 'web_review_screen',
        },
      };

      setSubmitStatus('loading', 'Submitting your responses…');
      el.reviewSubmit.disabled = true;

      try {
        const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/submit`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        let body = null;
        try {
          body = await response.json();
        } catch (err) {
          console.error('submit parse error', err);
        }

        if (!response.ok || !body?.ok) {
          const errorMessage = body?.error || `Submit failed (${response.status})`;
          setSubmitStatus('error', errorMessage);
          return;
        }

        localStorage.removeItem(STORE_KEY);
        app.answers = {};
        app.stack = [];
        setSubmitStatus('success', `Submitted successfully. Reference ID: ${body.id}`);
        showSubmitted(body.id);
      } catch (err) {
        console.error('submit error', err);
        setSubmitStatus('error', 'Could not submit right now. Please check your connection and try again.');
      } finally {
        el.reviewSubmit.disabled = false;
      }
    }
  
    function getQ(id) {
      return app.schema && app.schema.questions && app.schema.questions[id];
    }
  
    function goTo(id, forward) {
      const q = getQ(id);
      app.currentId = id;
  
      // Toggle review/submitted sections
      if (!q || q.type === 'review') {
        return showReview();
      }
  
      showForm();
      renderQuestion(q);
      updateProgress();
  
      // Focus first interactive element for accessibility
      const focusable = el.qwrap.querySelector('button, input, textarea, select');
      if (focusable) focusable.focus();
  
      // Back button state
      el.back.disabled = app.stack.length === 0;
    }
  
    function updateProgress() {
      // Simple heuristic: answered unique count over answered + remaining-estimate
      const answered = Object.keys(app.answers).length;
      const total = Object.keys(app.schema.questions).length;
      const pct = Math.min(100, Math.round((answered / Math.max(1, total - 2)) * 100));
      el.progressBar.style.width = pct + '%';
    }
  
    function renderError(msg) {
      el.qwrap.innerHTML = `<div class="notice error">${escapeHtml(msg)}</div>`;
    }

    // --- Option tile renderers ---
    function renderSingle(q) {
      const wrap = document.createElement('div');
      wrap.className = 'options single';
      const opts = Array.isArray(q.options) ? q.options : [];
      opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option';
        btn.setAttribute('aria-pressed', 'false');
        btn.dataset.value = String(opt.value ?? opt);

        // optional image
        if (opt.img || q.showImages) {
          const img = document.createElement('img');
          img.className = 'option-img';
          img.alt = opt.label ? String(opt.label) : '';
          img.src = opt.img || PLACEHOLDER_IMG;
          btn.appendChild(img);
        }
        const label = document.createElement('div');
        label.className = 'option-label';
        label.textContent = String(opt.label ?? opt);
        btn.appendChild(label);

        btn.addEventListener('click', () => {
          wrap.querySelectorAll('.option').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-pressed','false'); });
          btn.classList.add('selected');
          btn.setAttribute('aria-pressed','true');
        });
        wrap.appendChild(btn);
      });
      return wrap;
    }

    function renderMulti(q) {
      const wrap = document.createElement('div');
      wrap.className = 'options multi';
      const opts = Array.isArray(q.options) ? q.options : [];
      const hasNone = opts.some(o => (o.value ?? o) === 'none');

      opts.forEach(opt => {
        const value = String(opt.value ?? opt);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option';
        btn.setAttribute('aria-pressed', 'false');
        btn.dataset.value = value;

        if (opt.img || q.showImages) {
          const img = document.createElement('img');
          img.className = 'option-img';
          img.alt = opt.label ? String(opt.label) : '';
          img.src = opt.img || PLACEHOLDER_IMG;
          btn.appendChild(img);
        }
        const label = document.createElement('div');
        label.className = 'option-label';
        label.textContent = String(opt.label ?? opt);
        btn.appendChild(label);

        btn.addEventListener('click', () => {
          const isNone = value === 'none';
          if (isNone) {
            // None is exclusive: clear others, select only none
            wrap.querySelectorAll('.option').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-pressed','false'); });
            btn.classList.add('selected');
            btn.setAttribute('aria-pressed','true');
          } else {
            // Toggle this one
            const nowSel = !btn.classList.contains('selected');
            btn.classList.toggle('selected', nowSel);
            btn.setAttribute('aria-pressed', nowSel ? 'true' : 'false');
            // If any non-none selected, ensure none is cleared
            if (hasNone) {
              wrap.querySelector('.option[data-value="none"]')?.classList.remove('selected');
              wrap.querySelector('.option[data-value="none"]')?.setAttribute('aria-pressed','false');
            }
          }
        });
        wrap.appendChild(btn);
      });
      return wrap;
    }

    function renderSlider(q) {
      const wrap = document.createElement('div');
      wrap.className = 'slider-row';

      const min = q.input?.min ?? 0;
      const max = q.input?.max ?? 100;
      const step = q.input?.step ?? 1;
      const value = (app.answers[q.id] != null) ? app.answers[q.id] : (q.input?.default ?? min);

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      range.value = String(value);

      const number = document.createElement('input');
      number.type = 'number';
      number.min = String(min);
      number.max = String(max);
      number.step = String(step);
      number.value = String(value);

      range.addEventListener('input', () => { number.value = range.value; });
      number.addEventListener('input', () => {
        const v = Math.min(max, Math.max(min, parseFloat(number.value || '')));
        if (!Number.isNaN(v)) range.value = String(v);
      });

      wrap.appendChild(range);
      wrap.appendChild(number);
      return wrap;
    }

    function renderQuestion(q) {
      // Clear container
      el.qwrap.innerHTML = '';

      const wrapper = document.createElement('div');
      wrapper.className = 'question';

      const h = document.createElement('h2');
      h.textContent = q.label || 'Question';
      wrapper.appendChild(h);

      // Help text (from schema only; modules should not inject duplicates)
      if (q.help) {
        const help = document.createElement('div');
        help.className = 'help';
        help.textContent = q.help;
        wrapper.appendChild(help);
      }

      // Render control by type
      let ui = null;
      if (q.type === 'single' && typeof renderSingle === 'function') {
        ui = renderSingle(q);
      } else if (q.type === 'multi' && typeof renderMulti === 'function') {
        ui = renderMulti(q);
      } else if (q.type === 'text' && typeof renderText === 'function') {
        ui = renderText(q);
      } else if (q.type === 'slider' && typeof renderSlider === 'function') {
        ui = renderSlider(q);
      } else if (q.type === 'ocular_dominance') {
        ui = renderOcularDominance(q);
      } else {
        const msg = document.createElement('div');
        msg.className = 'notice';
        msg.textContent = 'Unsupported question type: ' + (q.type || 'unknown');
        ui = msg;
      }

      if (ui) wrapper.appendChild(ui);

      // Inline error holder
      const err = document.createElement('div');
      err.id = 'error_' + q.id;
      err.className = 'error';
      wrapper.appendChild(err);

      el.qwrap.appendChild(wrapper);

      // Restore any saved answer onto the freshly rendered UI
      restoreAnswer(q);
    }

    // Minimal lazy-loader host for ocular dominance
    function renderOcularDominance(q) {
      const mount = document.createElement('div');
      mount.className = 'ocular-wrap';

      const loading = document.createElement('div');
      loading.className = 'notice';
      loading.textContent = 'Loading camera tool…';
      mount.appendChild(loading);

      import('./ocular.js').then(mod => {
        if (mod && typeof mod.mountOcularDominance === 'function') {
          mount.innerHTML = '';
          mod.mountOcularDominance({
            container: mount,
            question: q,
            save: (val) => { app.answers[q.id] = val; saveAnswers(); }
          });
        } else {
          loading.textContent = 'Unable to load camera tool.';
        }
      }).catch(err => {
        console.error('ocular.js load error', err);
        loading.textContent = 'Unable to load camera tool.';
      });

      return mount;
    }

    // Text renderer (supports readonly info pages)
    function renderText(q) {
      const wrap = document.createElement('div');
      wrap.className = 'text-row';
      const isReadonly = q.input && q.input.readonly;
      const isArea = q.input && q.input.textarea;

      // Optional preset/notice block
      if (q.preset) {
        const notice = document.createElement('div');
        notice.className = 'notice';
        notice.textContent = q.preset;
        wrap.appendChild(notice);
      }

      // For readonly info screens: do not render an input at all (removes empty white box)
      if (isReadonly) {
        return wrap;
      }

      // Editable text control (+ mic)
      const ctrl = document.createElement(isArea ? 'textarea' : 'input');
      if (!isArea) ctrl.type = 'text';
      ctrl.id = 'input_' + q.id;
      ctrl.placeholder = q.input && q.input.placeholder ? q.input.placeholder : '';
      wrap.appendChild(ctrl);

      const micBtn = document.createElement('button');
      micBtn.type = 'button';
      micBtn.className = 'btn mic-btn';
      micBtn.setAttribute('aria-label', 'Start dictation');
      micBtn.textContent = '🎤';
      wrap.appendChild(micBtn);

      attachDictation(ctrl, micBtn);
      return wrap;
    }

    function restoreAnswer(q) {
      const val = app.answers[q.id];
      if (val == null) return;

      // Single-choice and ocular-dominance behave the same
      if (q.type === 'single' || q.type === 'ocular_dominance') {
        el.qwrap.querySelectorAll('.option').forEach(btn => {
          if (btn.getAttribute('data-value') === String(val)) btn.classList.add('selected');
        });
        return;
      }

      // Multi-select with NONE exclusivity normalisation
      if (q.type === 'multi') {
        if (!Array.isArray(val)) return;
        let arr = val.slice();
        if (arr.includes('none') && arr.some(v => v !== 'none')) {
          arr = arr.filter(v => v !== 'none');
          app.answers[q.id] = arr;
          saveAnswers();
        }
        const set = new Set(arr);
        el.qwrap.querySelectorAll('.option').forEach(btn => {
          if (set.has(btn.getAttribute('data-value'))) btn.classList.add('selected');
        });
        return;
      }

      // Range + numeric fallback
      if (q.type === 'slider') {
        const range = el.qwrap.querySelector('input[type=range]');
        const number = el.qwrap.querySelector('input[type=number]');
        if (range) range.value = val;
        if (number) number.value = val;
        return;
      }

      // Text
      if (q.type === 'text') {
        const ctrl = el.qwrap.querySelector('input, textarea');
        if (ctrl) ctrl.value = val;
        return;
      }
    }

    function readAnswer(q) {
      if (q.type === 'single') {
        const sel = el.qwrap.querySelector('.option.selected');
        return sel ? sel.getAttribute('data-value') : null;
      }
      if (q.type === 'multi') {
        const arr = [];
        el.qwrap.querySelectorAll('.option.selected').forEach(btn => arr.push(btn.getAttribute('data-value')));
        return arr;
      }
      if (q.type === 'slider') {
        const range = el.qwrap.querySelector('input[type=range]');
        return range ? parseFloat(range.value) : null;
      }
      if (q.type === 'text') {
        const ctrl = el.qwrap.querySelector('input, textarea');
        return ctrl ? ctrl.value.trim() : '';
      }
      if (q.type === 'ocular_dominance') {
        const sel = el.qwrap.querySelector('.option.selected');
        return sel ? sel.getAttribute('data-value') : null;
      }
      return null;
    }
  
    function validate(q, ans) {
      // Required check
      if (q.required && (ans == null || (Array.isArray(ans) && ans.length === 0) || ans === '')) {
        showError(q.id, 'Please choose an option to continue.');
        return false;
      }
      // Optional: add specific validations per type if needed
      clearError(q.id);
      return true;
    }
  
    // Core routing helper — supports "when" and "byAnswerOf"
    function getNextId(currId, answer) {
      const q = app.schema?.questions?.[currId];
      if (!q || q.next == null) return null;
  
      if (typeof q.next === 'string') return q.next;
  
      if (typeof q.next === 'object') {
        const nx = q.next;
  
        // Case 1: based on THIS question's answer
        if (nx.when) {
          if (Array.isArray(answer)) {
            for (const v of answer) if (nx.when[v] != null) return nx.when[v];
          } else if (answer != null && nx.when[answer] != null) {
            return nx.when[answer];
          }
          if (nx.default != null) return nx.default;
        }
  
        // Case 2: based on ANOTHER question's answer
        if (nx.byAnswerOf && nx.map) {
          const key = app.answers[nx.byAnswerOf];
          if (Array.isArray(key)) {
            for (const v of key) if (nx.map[v] != null) return nx.map[v];
          } else if (key != null && nx.map[key] != null) {
            return nx.map[key];
          }
          if (nx.default != null) return nx.default;
        }
      }
      return null;
    }
  
    function showReview() {
      // Build a simple review list from answers
      const list = document.createElement('div');
      list.className = 'review-list';
  
      const qids = Object.keys(app.answers);
      qids.forEach(id => {
        const q = getQ(id);
        if (!q) return;
        const row = document.createElement('div');
        row.className = 'review-row';
        const label = document.createElement('div');
        label.className = 'review-label';
        label.textContent = q.label || id;
        const value = document.createElement('div');
        value.className = 'review-value';
        value.textContent = prettyAnswer(app.answers[id], q);
        row.appendChild(label); row.appendChild(value);
        list.appendChild(row);
      });
  
      el.reviewContent.innerHTML = '';
      el.reviewContent.appendChild(list);
  
      // Show review section, hide form
      el.form.classList.add('hidden');
      el.review.classList.remove('hidden');
      el.submitted.classList.add('hidden');
      setSubmitStatus('');
    }
  
    function showForm() {
      el.form.classList.remove('hidden');
      el.review.classList.add('hidden');
      el.submitted.classList.add('hidden');
      setSubmitStatus('');
    }

    function showSubmitted(submissionId) {
      const payload = {
        title: app.schema.title || 'Pre‑Consultation',
        submission_id: submissionId,
        submitted_at: new Date().toISOString(),
      };
      el.submittedMessage.textContent = `Your responses were sent successfully. Submission ID: ${submissionId}`;
      el.output.value = JSON.stringify(payload, null, 2);
      el.form.classList.add('hidden');
      el.review.classList.add('hidden');
      el.submitted.classList.remove('hidden');
      el.output.focus();
    }

    function setSubmitStatus(kind, message = '') {
      if (!el.reviewStatus) return;
      el.reviewStatus.className = `submit-status ${kind || ''}`.trim();
      el.reviewStatus.textContent = message;
    }

    function getSchemaVersion() {
      const version = app.schema?.schema_version || app.schema?.version || 'v1';
      return String(version).trim() || 'v1';
    }
  
    function prettyAnswer(val, q) {
      if (Array.isArray(val)) return val.join(', ');
      if (val == null) return '';
      if (q && q.type === 'slider') return String(val);
      if (typeof val === 'string') return val;
      try { return JSON.stringify(val); } catch { return String(val); }
    }

    // Utilities
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    }
    function showError(id, msg) {
      const box = document.getElementById('error_' + id);
      if (box) { box.textContent = msg; box.classList.add('show'); }
    }
    function clearError(id) {
      const box = document.getElementById('error_' + id);
      if (box) { box.textContent = ''; box.classList.remove('show'); }
    }

    // --- Dictation helper ---
    function attachDictation(inputEl, buttonEl) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { buttonEl.classList.add('hidden'); buttonEl.disabled = true; return; }

      let rec = null;
      let active = false;

      function setActive(on) {
        active = on;
        buttonEl.setAttribute('aria-pressed', on ? 'true' : 'false');
        buttonEl.textContent = on ? 'Stop dictation' : 'Dictate';
      }

      buttonEl.addEventListener('click', () => {
        if (active && rec) { rec.stop(); return; }

        rec = new SR();
        rec.lang = 'en-AU';
        rec.interimResults = true;
        rec.continuous = false;

        let interim = '';
        let committed = inputEl.value || '';

        rec.onstart = () => setActive(true);
        rec.onend   = () => setActive(false);
        rec.onerror = () => setActive(false);

        rec.onresult = (e) => {
          interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const seg = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
              committed = (committed ? committed + ' ' : '') + seg;
              inputEl.value = committed.trim();
              inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
              inputEl.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              interim += seg;
            }
          }
          buttonEl.title = interim ? ('Listening… ' + interim) : 'Click to dictate';
        };

        rec.start();
      });
    }

  })();
