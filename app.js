  // app.js — schema-driven questionnaire engine (no framework)
  // Loads schema.json, renders one question per page, supports branching via
  //  - next: "id"
  //  - next: { when: { answerValue: "id", ... }, default: "id" }
  //  - next: { byAnswerOf: "<prevQuestionId>", map: { value: "id", ... }, default: "id" }
  // Stores answers in localStorage until submit.
  
  (function () {
    const SCHEMA_URL = 'schema.json';
    const STORE_KEY = 'preconsult_answers_v1';

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
        btn.setAttribute('data-value', opt.value);
        if (current === opt.value) btn.classList.add('selected');
  
        // If this is the drops list (A5_drops), show an image per option
        if (q.id === 'A5_drops') {
          const img = document.createElement('img');
          img.className = 'opt-img';
          img.alt = (opt.label || 'Drop') + ' image';
          img.src = opt.img || PLACEHOLDER_IMG; // use provided image or the generic placeholder
          btn.appendChild(img);
          const span = document.createElement('span');
          span.className = 'option-label';
          span.textContent = opt.label;
          btn.appendChild(span);
        } else {
          // Default text-only button
          btn.textContent = opt.label;
        }
  
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
        btn.setAttribute('data-value', opt.value);
        if (current.includes(opt.value)) btn.classList.add('selected');
  
        // Image support for drops list
        if (q.id === 'A5_drops') {
          const img = document.createElement('img');
          img.className = 'opt-img';
          img.alt = (opt.label || 'Drop') + ' image';
          img.src = opt.img || PLACEHOLDER_IMG;
          btn.appendChild(img);
          const span = document.createElement('span');
          span.className = 'option-label';
          span.textContent = opt.label;
          btn.appendChild(span);
        } else {
          btn.textContent = opt.label;
        }
  
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

      const cfg = Object.assign({ min: 0, max: 100, step: 1 }, (q.input || {}));

      const range = document.createElement('input');
      range.type = 'range';
      range.min = cfg.min; range.max = cfg.max; range.step = cfg.step;
      range.setAttribute('aria-label', 'value');

      const number = document.createElement('input');
      number.type = 'number';
      number.min = cfg.min; number.max = cfg.max; number.step = cfg.step;
      number.className = 'number-input';
      number.inputMode = 'decimal';

      const initial = app.answers[q.id] ?? cfg.min;
      range.value = initial; number.value = initial;

      const sync = (v) => {
        let n = parseFloat(v);
        if (Number.isNaN(n)) n = cfg.min;
        n = Math.max(cfg.min, Math.min(cfg.max, n));
        const s = String(n);
        range.value = s; number.value = s;
      };

      range.addEventListener('input', () => { number.value = range.value; });
      number.addEventListener('input', () => { sync(number.value); });

      wrap.appendChild(range);
      // Always show numeric fallback beside slider
      wrap.appendChild(number);
      return wrap;
    }
  
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
  
    function renderOcularDominance(q) {
      // Lazy-load the webcam tool to keep app.js small and avoid canvas limits
      const mount = document.createElement('div');
      mount.className = 'ocular-wrap';

      const p = document.createElement('p');
      p.className = 'help';
      p.textContent = 'Which is your dominant eye? If you do not know, please click on the tool to determine.';
      mount.appendChild(p);

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
