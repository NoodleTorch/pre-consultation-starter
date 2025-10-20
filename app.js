(function () {
  // ------- Load external schema.json (no code edits for questions) -------------
  let SCHEMA = null; // will be loaded from schema.json

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const formEl = $('#form');
  const container = $('#questionContainer');
  const progressBar = $('#progressBar');
  const backBtn = $('#backBtn');
  const nextBtn = $('#nextBtn');
  const reviewPanel = $('#review');
  const reviewContent = $('#reviewContent');
  const reviewBackBtn = $('#reviewBackBtn');
  const submitBtn = $('#submitBtn');
  const submitted = $('#submitted');
  const output = $('#output');
  const copyBtn = $('#copyBtn');
  const downloadBtn = $('#downloadBtn');
  const restartBtn = $('#restartBtn');

  const app = { order: [], idx: 0, answers: {}, started: false };

  function setLoading(msg) {
    formEl.classList.remove('hidden');
    reviewPanel.classList.add('hidden');
    submitted.classList.add('hidden');
    backBtn.disabled = true; nextBtn.disabled = true; nextBtn.textContent = 'Next';
    container.innerHTML = '';
    const p = document.createElement('p'); p.className = 'helper'; p.textContent = msg || 'Loading…';
    container.appendChild(p);
  }

  async function loadSchema() {
    try {
      setLoading('Loading questionnaire…');
      const res = await fetch('schema.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load schema.json');
      SCHEMA = await res.json();
      // Restore saved answers if any
      try {
        const saved = JSON.parse(localStorage.getItem('precon_answers') || 'null');
        if (saved && typeof saved === 'object') app.answers = saved;
      } catch {}
      buildPath();
      if (!app.order.length) app.order = [SCHEMA.start];
      render();
    } catch (e) {
      setLoading('Could not load the questionnaire. Please check that schema.json is present.');
      console.error(e);
    }
  }

  // ------- Navigation helpers --------------------------------------------------
  function getNextId(currId, answer) {
    const q = SCHEMA?.questions?.[currId];
    if (!q || q.next == null) return null;
    if (typeof q.next === 'string') return q.next;
    if (typeof q.next === 'object' && q.next.when) {
      // If answer is array (multi), route on first match
      if (Array.isArray(answer)) {
        for (const v of answer) {
          if (q.next.when[v] != null) return q.next.when[v];
        }
      } else if (answer != null && q.next.when[answer] != null) {
        return q.next.when[answer];
      }
      return q.next.default ?? null;
    }
    return null;
  }

  function buildPath() {
    if (!SCHEMA) return;
    const path = [];
    let seen = new Set();
    let id = SCHEMA.start;
    while (id && !seen.has(id)) {
      seen.add(id); path.push(id);
      const ans = app.answers[id];
      id = getNextId(id, ans);
      if (!id) break;
      if (id === 'review') { path.push('review'); break; }
    }
    app.order = path;
    updateProgress();
  }

  function updateProgress() {
    const total = app.order.length || 1;
    const pct = Math.round((Math.min(app.idx + 1, total) / total) * 100);
    progressBar.style.width = pct + '%';
  }

  function render() {
    if (!SCHEMA) { setLoading('Loading questionnaire…'); return; }
    buildPath();

    const id = app.order[app.idx];
    const q = SCHEMA.questions[id];

    // Panels visibility
    formEl.classList.toggle('hidden', id === 'review');
    reviewPanel.classList.toggle('hidden', id !== 'review');
    submitted.classList.add('hidden');

    backBtn.disabled = app.idx === 0;

    if (id === 'review') { renderReview(); return; }

    // Draw question
    container.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.className = 'question'; h2.textContent = q.label; container.appendChild(h2);

    if (q.help) {
      const p = document.createElement('p'); p.className = 'helper'; p.id = 'help'; p.textContent = q.help; container.appendChild(p);
    }

    let control = null;
    if (q.type === 'text') control = renderText(q);
    else if (q.type === 'slider') control = renderSlider(q);
    else if (q.type === 'single') control = renderSingle(q);
    else if (q.type === 'multi') control = renderMulti(q);
    else if (q.type === 'ocular_dominance') control = renderOcularDominance(q);

    if (control) container.appendChild(control);

    nextBtn.textContent = 'Next';
    const last = app.order[app.order.length - 1];
    if (last === id) nextBtn.textContent = 'Review';

    validateAndToggleNext();

    const first = container.querySelector('input, textarea, button.option-btn');
    if (first) first.focus();
  }

  // ------- Renderers -----------------------------------------------------------
  function renderText(q) {
    const wrap = document.createElement('div');
    let el;
    if (q.input && q.input.textarea) {
      el = document.createElement('textarea'); el.rows = 4; if (q.input.readonly) el.readOnly = true; if (q.preset) el.value = q.preset;
    } else {
      el = document.createElement('input'); el.type = 'text'; el.inputMode = 'text';
    }
    if (q.input && q.input.placeholder) el.placeholder = q.input.placeholder;
    el.value = (app.answers[q.id] ?? '');
    el.addEventListener('input', () => { app.answers[q.id] = el.value.trim(); validateAndToggleNext(); });

    if (!(q.input && q.input.readonly)) {
      const mic = document.createElement('button'); mic.type = 'button'; mic.className = 'mic'; mic.setAttribute('aria-pressed','false'); mic.textContent = '🎤 Speak';
      let rec = null;
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition; rec = new SR(); rec.lang = 'en-AU'; rec.interimResults = false;
        rec.onresult = (e) => { const txt = Array.from(e.results).map(r=>r[0].transcript).join(' '); el.value = (el.value + ' ' + txt).trim(); app.answers[q.id] = el.value; validateAndToggleNext(); };
        rec.onend = () => { mic.setAttribute('aria-pressed','false'); };
        mic.addEventListener('click', () => { if (mic.getAttribute('aria-pressed') === 'true') { rec.stop(); return; } mic.setAttribute('aria-pressed','true'); rec.start(); });
      } else { mic.disabled = true; mic.title = 'Voice input not supported in this browser.'; }
      const row = document.createElement('div'); row.appendChild(el); row.appendChild(mic); return row;
    }
    return el;
  }

  function renderSlider(q) {
    const wrap = document.createElement('div');
    const input = document.createElement('input'); input.type = 'range'; input.min = q.input?.min ?? 0; input.max = q.input?.max ?? 100; input.step = q.input?.step ?? 1;
    const current = app.answers[q.id] ?? Math.round((Number(input.min)+Number(input.max))/2); input.value = current;

    const value = document.createElement('div'); value.className = 'range-value'; value.textContent = String(current);

    const number = document.createElement('input'); number.type = 'number'; number.min = input.min; number.max = input.max; number.step = input.step; number.value = current; number.style.marginTop = '.5rem';

    function sync(val){
      const n = String(val).trim(); const v = n === '' ? '' : Number(n);
      if (n === '' || isNaN(v)) { value.textContent = ''; app.answers[q.id] = ''; }
      else { const clamped = Math.max(Number(input.min), Math.min(Number(input.max), v)); input.value = clamped; number.value = clamped; value.textContent = String(clamped); app.answers[q.id] = clamped; }
      validateAndToggleNext();
    }
    input.addEventListener('input', (e)=> sync(e.target.value));
    number.addEventListener('input', (e)=> sync(e.target.value));

    wrap.appendChild(input); if (q.input?.showValue) wrap.appendChild(value); wrap.appendChild(number); return wrap;
  }

  function renderSingle(q) {
    const wrap = document.createElement('div'); wrap.className = 'options';
    const current = app.answers[q.id] ?? null;
    (q.options || []).forEach(opt => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'option-btn'; btn.setAttribute('role', 'radio'); btn.setAttribute('aria-pressed', String(current === opt.value)); btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        app.answers[q.id] = opt.value; wrap.querySelectorAll('.option-btn').forEach(b => b.setAttribute('aria-pressed','false')); btn.setAttribute('aria-pressed','true'); validateAndToggleNext(); if (matchMedia('(pointer: coarse)').matches) goNext();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderMulti(q) {
    const wrap = document.createElement('div'); wrap.className = 'options';
    const current = new Set(app.answers[q.id] || []);
    (q.options || []).forEach(opt => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'option-btn'; btn.setAttribute('aria-pressed', String(current.has(opt.value))); btn.textContent = opt.label;
      btn.addEventListener('click', () => { if (current.has(opt.value)) current.delete(opt.value); else current.add(opt.value); app.answers[q.id] = Array.from(current); btn.setAttribute('aria-pressed', String(current.has(opt.value))); validateAndToggleNext(); });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderOcularDominance(q) {
    const wrap = document.createElement('div');
    const p = document.createElement('p'); p.className = 'helper'; p.textContent = q.help || ''; wrap.appendChild(p);

    const row = document.createElement('div'); row.className = 'options';
    ['Left eye seems dominant','Right eye seems dominant','Unsure'].forEach((label,i)=>{
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'option-btn'; btn.textContent = label;
      btn.addEventListener('click', () => { app.answers[q.id] = ['left','right','unsure'][i]; validateAndToggleNext(); if (matchMedia('(pointer: coarse)').matches) goNext(); });
      row.appendChild(btn);
    });

    const camWrap = document.createElement('div'); camWrap.style.marginTop = '1rem';
    const camBtn = document.createElement('button'); camBtn.type = 'button'; camBtn.className = 'btn secondary'; camBtn.textContent = 'Try webcam helper (beta)'; camBtn.addEventListener('click', startCamHelper); camWrap.appendChild(camBtn);

    wrap.appendChild(row); wrap.appendChild(camWrap); return wrap;
  }

  function startCamHelper(){
    const overlay = document.createElement('div'); Object.assign(overlay.style,{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'grid', placeItems:'center', zIndex:9999, padding:'1rem'});
    const panel = document.createElement('div'); panel.style.background = '#0f141a'; panel.style.border = '1px solid #223140'; panel.style.borderRadius = '16px'; panel.style.padding = '1rem'; panel.style.width = 'min(800px, 95vw)';
    const title = document.createElement('h3'); title.textContent = 'Webcam helper (beta)'; panel.appendChild(title);
    const tips = document.createElement('p'); tips.textContent = 'Centre a distant object through the finger circle. Keep both eyes open. This beta shows your face to help alignment; it does not store video.'; panel.appendChild(tips);
    const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.style.width = '100%'; video.style.borderRadius = '12px'; panel.appendChild(video);
    const bar = document.createElement('div'); bar.className = 'nav';
    const close = document.createElement('button'); close.className='btn secondary'; close.textContent='Close';
    const setLeft = document.createElement('button'); setLeft.className='btn'; setLeft.textContent='Set Left dominant';
    const setRight = document.createElement('button'); setRight.className='btn'; setRight.textContent='Set Right dominant';
    bar.appendChild(close); bar.appendChild(setLeft); bar.appendChild(setRight); panel.appendChild(bar); overlay.appendChild(panel); document.body.appendChild(overlay);

    let stream; navigator.mediaDevices?.getUserMedia?.({ video:true, audio:false }).then(s => { stream = s; video.srcObject = s; }).catch(()=>{ tips.textContent = 'Could not access camera. You can still choose manually above.'; });
    function cleanup(){ if (stream) stream.getTracks().forEach(t=>t.stop()); overlay.remove(); }
    close.onclick = cleanup; setLeft.onclick = () => { app.answers['ocular_dominance'] = 'left'; cleanup(); validateAndToggleNext(); }; setRight.onclick = () => { app.answers['ocular_dominance'] = 'right'; cleanup(); validateAndToggleNext(); };
  }

  // ------- Validation & flow ---------------------------------------------------
  function validate(qid) {
    if (!SCHEMA) return false;
    const q = SCHEMA.questions[qid]; if (!q) return true;
    const ans = app.answers[qid];
    if (q.required) {
      if (q.type === 'text') return typeof ans === 'string' && ans.trim().length > 0;
      if (q.type === 'slider') return ans !== undefined && ans !== '';
      if (q.type === 'single') return !!ans;
      if (q.type === 'multi') return Array.isArray(ans) && ans.length > 0;
    }
    return true;
  }

  function validateAndToggleNext() { const id = app.order[app.idx]; const ok = validate(id); nextBtn.disabled = !ok; }

  function goNext() {
    const id = app.order[app.idx]; if (!validate(id)) { nextBtn.disabled = true; return; }
    try { localStorage.setItem('precon_answers', JSON.stringify(app.answers)); } catch {}
    app.idx = Math.min(app.idx + 1, app.order.length - 1); buildPath();
    if (SCHEMA.questions[app.order[app.idx]]?.type === 'review') { renderReview(); }
    render();
  }

  function goBack() { app.idx = Math.max(0, app.idx - 1); render(); }

  function renderReview() {
    formEl.classList.add('hidden'); reviewPanel.classList.remove('hidden'); submitted.classList.add('hidden');
    const dl = document.createElement('dl');
    for (const id of Object.keys(SCHEMA.questions)) {
      if (id === 'review') continue; if (!app.order.includes(id)) continue;
      const q = SCHEMA.questions[id]; const ans = app.answers[id];
      if (ans == null || ans === '' || (Array.isArray(ans) && ans.length === 0)) continue;
      const dt = document.createElement('dt'); dt.textContent = q.label; const dd = document.createElement('dd'); dd.textContent = Array.isArray(ans) ? ans.join(', ') : String(ans); dl.appendChild(dt); dl.appendChild(dd);
    }
    reviewContent.innerHTML = ''; reviewContent.appendChild(dl);
  }

  function submit() {
    const payload = { _meta: { title: SCHEMA.title, generatedAt: new Date().toISOString(), version: 'starter-v1-json' }, answers: app.answers };
    output.value = JSON.stringify(payload, null, 2); reviewPanel.classList.add('hidden'); submitted.classList.remove('hidden');
  }

  function copy() { output.select(); document.execCommand('copy'); }

  function download() { const blob = new Blob([output.value], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'preconsultation_answers.json'; a.click(); URL.revokeObjectURL(url); }

  function restart() { app.answers = {}; app.idx = 0; app.started = false; app.order = []; try { localStorage.removeItem('precon_answers'); } catch {} render(); }

  // Wire buttons
  backBtn.addEventListener('click', goBack);
  nextBtn.addEventListener('click', goNext);
  reviewBackBtn.addEventListener('click', () => { app.idx = Math.max(0, app.order.length - 2); render(); });
  submitBtn.addEventListener('click', submit);
  copyBtn.addEventListener('click', copy);
  downloadBtn.addEventListener('click', download);
  restartBtn.addEventListener('click', restart);

  // Boot
  loadSchema();
})();