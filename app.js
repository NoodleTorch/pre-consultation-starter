// app.js — schema-driven questionnaire engine (no framework)
// Loads schema.json, renders one question per page, supports branching via
//  - next: "id"
//  - next: { when: { answerValue: "id", ... }, default: "id" }
//  - next: { byAnswerOf: "<prevQuestionId>", map: { value: "id", ... }, default: "id" }
// Stores answers in localStorage until submit.

(function () {
  const SCHEMA_URL = 'schema.json';
  const STORE_KEY = 'preconsult_answers_v1';

  // DOM refs
  const el = {
    form: document.getElementById('form'),
    qwrap: document.getElementById('questionContainer'),
    next: document.getElementById('nextBtn'),
    back: document.getElementById('backBtn'),
    progressBar: document.getElementById('progressBar'),

    review: document.getElementById('review'),
    reviewBack: document.getElementById('reviewBackBtn'),
    reviewContent: document.getElementById('reviewContent'),

    submitted: document.getElementById('submitted'),
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
    showForm();
    goTo(app.schema.start, false);
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

  function renderQuestion(q) {
    // Clear container
    el.qwrap.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'question';

    const h = document.createElement('h2');
    h.textContent = q.label || 'Question';
    wrapper.appendChild(h);

    if (q.help) {
      const p = document.createElement('p');
      p.className = 'help';
      p.textContent = q.help;
      wrapper.appendChild(p);
    }

    // Render by type
    let control = null;
    switch (q.type) {
      case 'single': control = renderSingle(q); break;
      case 'multi': control = renderMulti(q); break;
      case 'slider': control = renderSlider(q); break;
      case 'text': control = renderText(q); break;
      case 'ocular_dominance': control = renderOcularDominance(q); break;
      default: control = renderText(q); break;
    }

    wrapper.appendChild(control);

    // Show any error area
    const err = document.createElement('div');
    err.className = 'error-msg';
    err.id = 'error_' + q.id;
    err.setAttribute('aria-live', 'polite');
    wrapper.appendChild(err);

    el.qwrap.appendChild(wrapper);

    // Restore previous answer if any
    restoreAnswer(q);
  }

  function renderSingle(q) {
    const box = document.createElement('div');
    box.className = 'options single';
    const current = app.answers[q.id];

    (q.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt.label;
      btn.setAttribute('data-value', opt.value);
      if (current === opt.value) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        // deselect others
        box.querySelectorAll('.option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      box.appendChild(btn);
    });

    return box;
  }

  function renderMulti(q) {
    const box = document.createElement('div');
    box.className = 'options multi';
    const current = Array.isArray(app.answers[q.id]) ? app.answers[q.id] : [];

    (q.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      btn.textContent = opt.label;
      btn.setAttribute('data-value', opt.value);
      if (current.includes(opt.value)) btn.classList.add('selected');

      btn.addEventListener('click', () => {
        const NONE = 'none';
        const val = opt.value;
        if (val === NONE) {
          // Selecting NONE clears everything else and leaves only NONE
          box.querySelectorAll('.option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          return;
        }
        // Toggle normal option
        btn.classList.toggle('selected');
        // If NONE was selected previously, deselect it
        const noneBtn = box.querySelector('.option[data-value="none"]');
        if (noneBtn) noneBtn.classList.remove('selected');
      });

      box.appendChild(btn);
    });

    return box;
  }

  function renderSlider(q) {
    const wrap = document.createElement('div');
    wrap.className = 'slider-wrap';

    const cfg = Object.assign({ min: 0, max: 100, step: 1 }, q.input || {});

    const range = document.createElement('input');
    range.type = 'range';
    range.min = cfg.min; range.max = cfg.max; range.step = cfg.step;
    range.setAttribute('aria-label', 'value');

    const number = document.createElement('input');
    number.type = 'number';
    number.min = cfg.min; number.max = cfg.max; number.step = cfg.step;
    number.className = 'number-input';

    const initial = app.answers[q.id] ?? cfg.min;
    range.value = initial; number.value = initial;

    range.addEventListener('input', () => { number.value = range.value; });
    number.addEventListener('input', () => {
      const v = clamp(parseInt(number.value, 10), cfg.min, cfg.max);
      number.value = v; range.value = v;
    });

    wrap.appendChild(range);
    if (cfg.showValue) wrap.appendChild(number);
    return wrap;
  }

  function renderText(q) {
    const wrap = document.createElement('div');
    wrap.className = 'text-row';
    const isReadonly = q.input && q.input.readonly;
    const isArea = q.input && q.input.textarea;

    if (q.preset) {
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = q.preset;
      wrap.appendChild(notice);
    }

    const ctrl = document.createElement(isArea ? 'textarea' : 'input');
    if (!isArea) ctrl.type = 'text';
    ctrl.id = 'input_' + q.id;
    ctrl.placeholder = q.input && q.input.placeholder ? q.input.placeholder : '';
    if (isReadonly) {
      ctrl.setAttribute('readonly', 'readonly');
    }
    wrap.appendChild(ctrl);

    // Mic button
    const micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.className = 'btn mic-btn';
    micBtn.setAttribute('aria-label', 'Start dictation');
    micBtn.textContent = '🎤';
    wrap.appendChild(micBtn);

    if (isReadonly) {
      micBtn.classList.add('hidden');
      micBtn.disabled = true;
    } else {
      attachDictation(ctrl, micBtn);
    }

    return wrap;
  }

  function renderOcularDominance(q) {
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'help';
    p.textContent = q.help || 'Quick check using the finger‑circle method. If unsure, pick Not sure.';
    wrap.appendChild(p);

    const opts = [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'unsure', label: 'Not sure' }
    ];
    const box = document.createElement('div');
    box.className = 'options single';
    opts.forEach(opt => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'option'; b.textContent = opt.label; b.dataset.value = opt.value;
      b.addEventListener('click', () => {
        box.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
      });
      box.appendChild(b);
    });
    wrap.appendChild(box);

    // Placeholder for future webcam helper button
    const small = document.createElement('small');
    small.textContent = 'Webcam helper coming soon';
    wrap.appendChild(small);
    return wrap;
  }

  function restoreAnswer(q) {
    const val = app.answers[q.id];
    if (val == null) return;

    if (q.type === 'single') {
      el.qwrap.querySelectorAll('.option').forEach(btn => {
        if (btn.getAttribute('data-value') === String(val)) btn.classList.add('selected');
      });
    } else if (q.type === 'multi') {
      if (Array.isArray(val)) {
        // Normalise: if 'none' co-exists with any other value, drop 'none'
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
      }
    });
      }
    } else if (q.type === 'slider') {
      const range = el.qwrap.querySelector('input[type=range]');
      const number = el.qwrap.querySelector('input[type=number]');
      if (range) range.value = val;
      if (number) number.value = val;
    } else if (q.type === 'text') {
      const ctrl = el.qwrap.querySelector('input, textarea');
      if (ctrl) ctrl.value = val;
    } else if (q.type === 'ocular_dominance') {
      el.qwrap.querySelectorAll('.option').forEach(btn => {
        if (btn.getAttribute('data-value') === String(val)) btn.classList.add('selected');
      });
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
      return range ? parseInt(range.value, 10) : null;
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

    // Submit button action builds payload and shows submitted view
    document.getElementById('submitBtn').onclick = () => {
      const payload = {
        title: app.schema.title || 'Pre‑Consultation',
        timestamp: new Date().toISOString(),
        answers: app.answers,
      };
      const json = JSON.stringify(payload, null, 2);
      el.output.value = json;
      el.form.classList.add('hidden');
      el.review.classList.add('hidden');
      el.submitted.classList.remove('hidden');
      el.output.focus();
    };
  }

  function showForm() {
    el.form.classList.remove('hidden');
    el.review.classList.add('hidden');
    el.submitted.classList.add('hidden');
  }

  function prettyAnswer(val, q) {
    if (Array.isArray(val)) return val.join(', ');
    if (val == null || val === '') return '—';
    if (q && q.type === 'slider') return String(val);
    return String(val);
  }

  function showError(id, msg) {
    const e = document.getElementById('error_' + id);
    if (e) { e.textContent = msg; e.style.display = 'block'; }
  }
  function clearError(id) {
    const e = document.getElementById('error_' + id);
    if (e) { e.textContent = ''; e.style.display = 'none'; }
  }

  // --- Dictation helper ---
  function attachDictation(inputEl, buttonEl) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { buttonEl.classList.add('hidden'); buttonEl.disabled = true; return; }

    let rec = null;
    let active = false;

    buttonEl.addEventListener('click', () => {
      if (active && rec) { rec.stop(); return; }

      rec = new SR();
      rec.lang = 'en-AU';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onstart = () => { active = true; buttonEl.classList.add('recording'); buttonEl.textContent = '🎙️'; };
      rec.onerror = () => { active = false; buttonEl.classList.remove('recording'); buttonEl.textContent = '🎤'; };
      rec.onend   = () => { active = false; buttonEl.classList.remove('recording'); buttonEl.textContent = '🎤'; };

      rec.onresult = (e) => {
        let text = '';
        for (const r of e.results) text += r[0].transcript;
        inputEl.value = text;
      };

      rec.start();
    });
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, isNaN(v) ? min : v)); }
  function escapeHtml(s) { return String(s).replace(/[&<>"\u00A0]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\u00A0':'&nbsp;'}[c])); }
})();
