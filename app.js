(function () {
  // ------- Schema (edit safely) -------------------------------------------------
  // You can change labels/options/order here without touching the engine below.
  // Each question has: id, type, label, help, required, input, options?, next.
  // type: 'text' | 'slider' | 'single' | 'multi' | 'review' | 'ocular_dominance'
  const SCHEMA = {
    title: 'Pre‑Consultation (Ophthalmology)',
    start: 'consent',
    questions: {
      consent: {
        id: 'consent',
        type: 'single',
        label: 'Do you consent to completing a short pre‑consultation questionnaire?'
          + ' Your answers will be reviewed by the clinic team.',
        help: 'You can stop anytime. Your answers are kept on this device until you choose to submit.',
        required: true,
        input: { style: 'big' },
        options: [
          { value: 'yes', label: 'Yes, I agree' },
          { value: 'no', label: 'No, not today' }
        ],
        next: (a) => (a === 'yes' ? 'age' : 'review')
      },

      age: {
        id: 'age', type: 'slider', required: true,
        label: 'How old are you?',
        help: 'Slide or tap to set your age. You can also type a number.',
        input: { min: 18, max: 100, step: 1, showValue: true },
        next: 'gender'
      },

      gender: {
        id: 'gender', type: 'single', required: true,
        label: 'What is your gender?',
        input: { style: 'big' },
        options: [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'other', label: 'Other / prefer not to say' }
        ],
        next: 'pmhx'
      },

      pmhx: {
        id: 'pmhx', type: 'multi', required: false,
        label: 'Do you have any of the following? (tick any)',
        help: 'These can affect cataracts, glaucoma risk, or surgery planning.',
        options: [
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'hypertension', label: 'High blood pressure' },
          { value: 'heart', label: 'Heart disease' },
          { value: 'thyroid', label: 'Thyroid problems' },
          { value: 'sleep_apnoea', label: 'Sleep apnoea' },
          { value: 'steroids', label: 'Regular steroid use' },
          { value: 'anticoagulants', label: 'Blood thinners' },
          { value: 'none', label: 'None of these' }
        ],
        next: 'ocular_history'
      },

      ocular_history: {
        id: 'ocular_history', type: 'multi',
        label: 'Any eye conditions or previous eye surgery?',
        options: [
          { value: 'cataract', label: 'Cataract' },
          { value: 'glaucoma', label: 'Glaucoma' },
          { value: 'amd', label: 'Macular degeneration' },
          { value: 'diabetic_eye', label: 'Diabetic eye disease' },
          { value: 'prev_surgery', label: 'Previous eye surgery' },
          { value: 'none', label: 'None' }
        ],
        next: 'referral_reason'
      },

      referral_reason: {
        id: 'referral_reason', type: 'single', required: true,
        label: 'Why were you referred?',
        input: { style: 'big' },
        options: [
          { value: 'cataract', label: 'Referred for cataracts' },
          { value: 'glaucoma', label: 'Referred for glaucoma' },
          { value: 'both', label: 'Both cataract and glaucoma' },
          { value: 'vision_decrease', label: 'My vision has decreased recently' },
          { value: 'checkup', label: 'General check‑up' },
          { value: 'other', label: 'Other (will type)' }
        ],
        next: (a) => {
          if (a === 'cataract') return 'cataract_symptoms';
          if (a === 'glaucoma') return 'glaucoma_history';
          if (a === 'both') return 'cataract_symptoms';
          if (a === 'other') return 'other_reason';
          if (a === 'vision_decrease') return 'vision_details';
          return 'review';
        }
      },

      other_reason: {
        id: 'other_reason', type: 'text', required: true,
        label: 'Please tell us the reason for your visit',
        input: { placeholder: 'Type or use the mic' },
        next: 'review'
      },

      vision_details: {
        id: 'vision_details', type: 'text', required: false,
        label: 'Tell us about your vision changes',
        input: { placeholder: 'e.g., blurred distance, glare at night, double vision…' },
        next: 'review'
      },

      // --- Cataract branch ---
      cataract_symptoms: {
        id: 'cataract_symptoms', type: 'multi', required: false,
        label: 'Which symptoms bother you most? (pick any)',
        options: [
          { value: 'glare', label: 'Glare / halos at night' },
          { value: 'reading', label: 'Reading difficulties' },
          { value: 'distance', label: 'Distance blur (e.g., number plates)' },
          { value: 'contrast', label: 'Washed‑out colours / low contrast' },
          { value: 'double', label: 'Double vision in one eye' }
        ],
        next: 'lifestyle_priorities'
      },

      lifestyle_priorities: {
        id: 'lifestyle_priorities', type: 'single', required: true,
        label: 'If you had cataract surgery, what’s your priority?',
        input: { style: 'big' },
        options: [
          { value: 'distance', label: 'Clear distance vision without glasses' },
          { value: 'near', label: 'Near/reading without glasses' },
          { value: 'balanced', label: 'Balanced distance & near' },
          { value: 'unsure', label: 'Unsure — would like info' }
        ],
        next: 'astigmatism_known'
      },

      astigmatism_known: {
        id: 'astigmatism_known', type: 'single', required: true,
        label: 'Has anyone told you that you have astigmatism?',
        input: { style: 'big' },
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'unsure', label: 'Not sure' }
        ],
        next: 'lens_info'
      },

      lens_info: {
        id: 'lens_info', type: 'single', required: true,
        label: 'Would you like a brief intro to lens options now?',
        input: { style: 'big' },
        options: [
          { value: 'yes', label: 'Yes, show me briefly' },
          { value: 'no', label: 'No thanks' }
        ],
        next: (a) => (a === 'yes' ? 'lens_education' : 'ocular_dominance')
      },

      lens_education: {
        id: 'lens_education', type: 'text', required: false,
        label: 'Lens options (very brief):',
        input: { textarea: true, readonly: true },
        preset: 'Monofocal: sharp at one distance; Toric: corrects astigmatism;\n' +
                'EDOF: extended range, fewer halos but may still need glasses;\n' +
                'Multifocal: distance+near, more halos/glare for some.\n' +
                'Final recommendation will be personalised by your surgeon.'
        ,
        next: 'ocular_dominance'
      },

      ocular_dominance: {
        id: 'ocular_dominance', type: 'ocular_dominance', required: false,
        label: 'Ocular dominance (optional quick check)',
        help: 'Form a small circle with your fingers, arm’s length. With both eyes open, centre a distant object in the circle. Gently close one eye. The eye that keeps the object centred tends to be dominant. You can also try the webcam helper.',
        next: 'review'
      },

      // --- Glaucoma branch ---
      glaucoma_history: {
        id: 'glaucoma_history', type: 'multi', required: false,
        label: 'Glaucoma history (tick any)',
        options: [
          { value: 'fhx', label: 'Family history of glaucoma' },
          { value: 'prev_laser', label: 'Previous laser (e.g., SLT, LPI)' },
          { value: 'prev_surgery', label: 'Previous glaucoma surgery' },
          { value: 'drops', label: 'Currently on drops' },
          { value: 'none', label: 'None of these' }
        ],
        next: 'glaucoma_drops'
      },

      glaucoma_drops: {
        id: 'glaucoma_drops', type: 'text', required: false,
        label: 'If on drops, which ones? (e.g., latanoprost at night)',
        input: { placeholder: 'Type or use the mic' },
        next: 'review'
      },

      review: { id: 'review', type: 'review' }
    }
  };

  // ------- State & DOM helpers --------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const app = {
    order: [],
    idx: 0,
    answers: {},
    started: false
  };

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

  // Compute the next question id given current id & answer
  function getNextId(currId, answer) {
    const q = SCHEMA.questions[currId];
    if (!q || !q.next) return null;
    if (typeof q.next === 'function') return q.next(answer);
    return q.next;
  }

  function buildPath() {
    // Recompute a linear path from start, using current answers for branching
    const path = [];
    let seen = new Set();
    let id = SCHEMA.start;
    while (id && !seen.has(id)) {
      seen.add(id);
      path.push(id);
      const ans = app.answers[id];
      id = getNextId(id, ans);
      if (!id) break;
      if (id === 'review') { path.push('review'); break; }
    }
    app.order = path;
  }

  function updateProgress() {
    const total = app.order.length || 1;
    const pct = Math.round((Math.min(app.idx + 1, total) / total) * 100);
    progressBar.style.width = pct + '%';
  }

  function render() {
    buildPath();
    updateProgress();

    const id = app.order[app.idx];
    const q = SCHEMA.questions[id];

    // Toggle review/submitted panels
    formEl.classList.toggle('hidden', id === 'review');
    reviewPanel.classList.toggle('hidden', id !== 'review');
    submitted.classList.add('hidden');

    backBtn.disabled = app.idx === 0;

    if (id === 'review') {
      renderReview();
      return;
    }

    // Draw question
    container.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.className = 'question';
    h2.textContent = q.label;
    container.appendChild(h2);

    if (q.help) {
      const p = document.createElement('p');
      p.className = 'helper';
      p.id = 'help';
      p.textContent = q.help;
      container.appendChild(p);
    }

    let control = null;
    if (q.type === 'text') control = renderText(q);
    else if (q.type === 'slider') control = renderSlider(q);
    else if (q.type === 'single') control = renderSingle(q);
    else if (q.type === 'multi') control = renderMulti(q);
    else if (q.type === 'ocular_dominance') control = renderOcularDominance(q);

    if (control) container.appendChild(control);

    // Next button label
    nextBtn.textContent = 'Next';
    const last = app.order[app.order.length - 1];
    if (last === id) nextBtn.textContent = 'Review';

    // Validate current state to set button disabled
    validateAndToggleNext();

    // Focus first interactive element
    const first = container.querySelector('input, textarea, button.option-btn');
    if (first) first.focus();
  }

  function renderText(q) {
    const wrap = document.createElement('div');
    let el;
    if (q.input && q.input.textarea) {
      el = document.createElement('textarea');
      el.rows = 4;
      if (q.input.readonly) el.readOnly = true;
      if (q.preset) el.value = q.preset;
    } else {
      el = document.createElement('input');
      el.type = 'text';
      el.inputMode = 'text';
    }
    if (q.input && q.input.placeholder) el.placeholder = q.input.placeholder;
    el.value = (app.answers[q.id] ?? '');
    el.addEventListener('input', () => { app.answers[q.id] = el.value.trim(); validateAndToggleNext(); });

    // Mic button for voice input (if supported and not readonly)
    if (!(q.input && q.input.readonly)) {
      const mic = document.createElement('button');
      mic.type = 'button';
      mic.className = 'mic';
      mic.setAttribute('aria-pressed', 'false');
      mic.textContent = '🎤 Speak';
      let rec = null;
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        rec = new SR();
        rec.lang = 'en-AU';
        rec.interimResults = false;
        rec.onresult = (e) => {
          const txt = Array.from(e.results).map(r => r[0].transcript).join(' ');
          el.value = (el.value + ' ' + txt).trim();
          app.answers[q.id] = el.value; validateAndToggleNext();
        };
        rec.onend = () => { mic.setAttribute('aria-pressed','false'); };
        mic.addEventListener('click', () => {
          if (mic.getAttribute('aria-pressed') === 'true') { rec.stop(); return; }
          mic.setAttribute('aria-pressed','true'); rec.start();
        });
      } else {
        mic.disabled = true; mic.title = 'Voice input not supported in this browser.';
      }
      const row = document.createElement('div');
      row.appendChild(el);
      row.appendChild(mic);
      return row;
    }
    return el;
  }

  function renderSlider(q) {
    const wrap = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = q.input?.min ?? 0;
    input.max = q.input?.max ?? 100;
    input.step = q.input?.step ?? 1;
    const current = app.answers[q.id] ?? Math.round((Number(input.min)+Number(input.max))/2);
    input.value = current;

    const value = document.createElement('div');
    value.className = 'range-value';
    value.textContent = String(current);

    const number = document.createElement('input');
    number.type = 'number';
    number.min = input.min; number.max = input.max; number.step = input.step;
    number.value = current;
    number.style.marginTop = '.5rem';

    function sync(val){
      const n = String(val).trim();
      const v = n === '' ? '' : Number(n);
      if (n === '' || isNaN(v)) { value.textContent = ''; app.answers[q.id] = ''; }
      else {
        const clamped = Math.max(Number(input.min), Math.min(Number(input.max), v));
        input.value = clamped; number.value = clamped; value.textContent = String(clamped);
        app.answers[q.id] = clamped;
      }
      validateAndToggleNext();
    }
    input.addEventListener('input', (e)=> sync(e.target.value));
    number.addEventListener('input', (e)=> sync(e.target.value));

    wrap.appendChild(input);
    if (q.input?.showValue) wrap.appendChild(value);
    wrap.appendChild(number);
    return wrap;
  }

  function renderSingle(q) {
    const wrap = document.createElement('div');
    wrap.className = 'options';
    const current = app.answers[q.id] ?? null;
    (q.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-pressed', String(current === opt.value));
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        app.answers[q.id] = opt.value;
        // Unpress others
        wrap.querySelectorAll('.option-btn').forEach(b => b.setAttribute('aria-pressed','false'));
        btn.setAttribute('aria-pressed','true');
        validateAndToggleNext();
        // Auto-advance on coarse pointers (mobile) for smoother flow
        if (matchMedia('(pointer: coarse)').matches) goNext();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderMulti(q) {
    const wrap = document.createElement('div');
    wrap.className = 'options';
    const current = new Set(app.answers[q.id] || []);
    (q.options || []).forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'option-btn';
      btn.setAttribute('aria-pressed', String(current.has(opt.value)));
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        if (current.has(opt.value)) current.delete(opt.value); else current.add(opt.value);
        app.answers[q.id] = Array.from(current);
        btn.setAttribute('aria-pressed', String(current.has(opt.value)));
        validateAndToggleNext();
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function renderOcularDominance(q) {
    const wrap = document.createElement('div');
    const p = document.createElement('p');
    p.className = 'helper';
    p.textContent = q.help || '';
    wrap.appendChild(p);

    const row = document.createElement('div');
    row.className = 'options';

    ['Left eye seems dominant','Right eye seems dominant','Unsure'].forEach((label,i)=>{
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'option-btn';
      btn.textContent = label;
      btn.addEventListener('click', () => { app.answers[q.id] = ['left','right','unsure'][i]; validateAndToggleNext(); if (matchMedia('(pointer: coarse)').matches) goNext(); });
      row.appendChild(btn);
    });

    const camWrap = document.createElement('div');
    camWrap.style.marginTop = '1rem';
    const camBtn = document.createElement('button');
    camBtn.type = 'button'; camBtn.className = 'btn secondary'; camBtn.textContent = 'Try webcam helper (beta)';
    camBtn.addEventListener('click', startCamHelper);
    camWrap.appendChild(camBtn);

    wrap.appendChild(row);
    wrap.appendChild(camWrap);
    return wrap;
  }

  // Simple webcam overlay (placeholder)
  function startCamHelper(){
    const overlay = document.createElement('div');
    Object.assign(overlay.style,{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'grid', placeItems:'center', zIndex:9999, padding:'1rem'});

    const panel = document.createElement('div');
    panel.style.background = '#0f141a'; panel.style.border = '1px solid #223140'; panel.style.borderRadius = '16px'; panel.style.padding = '1rem'; panel.style.width = 'min(800px, 95vw)';

    const title = document.createElement('h3'); title.textContent = 'Webcam helper (beta)'; panel.appendChild(title);
    const tips = document.createElement('p'); tips.textContent = 'Centre a distant object through the finger circle. Keep both eyes open. This beta shows your face to help alignment; it does not store video.'; panel.appendChild(tips);

    const video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.style.width = '100%'; video.style.borderRadius = '12px'; panel.appendChild(video);

    const bar = document.createElement('div'); bar.className = 'nav';
    const close = document.createElement('button'); close.className='btn secondary'; close.textContent='Close';
    const setLeft = document.createElement('button'); setLeft.className='btn'; setLeft.textContent='Set Left dominant';
    const setRight = document.createElement('button'); setRight.className='btn'; setRight.textContent='Set Right dominant';
    bar.appendChild(close); bar.appendChild(setLeft); bar.appendChild(setRight);
    panel.appendChild(bar);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let stream;
    navigator.mediaDevices?.getUserMedia?.({ video:true, audio:false }).then(s => {
      stream = s; video.srcObject = s;
    }).catch(()=>{ tips.textContent = 'Could not access camera. You can still choose manually above.'; });

    function cleanup(){
      if (stream) stream.getTracks().forEach(t=>t.stop());
      overlay.remove();
    }
    close.onclick = cleanup;
    setLeft.onclick = () => { app.answers['ocular_dominance'] = 'left'; cleanup(); validateAndToggleNext(); };
    setRight.onclick = () => { app.answers['ocular_dominance'] = 'right'; cleanup(); validateAndToggleNext(); };
  }

  function validate(qid) {
    const q = SCHEMA.questions[qid];
    if (!q) return true;
    const ans = app.answers[qid];
    if (q.required) {
      if (q.type === 'text') return typeof ans === 'string' && ans.trim().length > 0;
      if (q.type === 'slider') return ans !== undefined && ans !== '';
      if (q.type === 'single') return !!ans;
      if (q.type === 'multi') return Array.isArray(ans) && ans.length > 0;
    }
    return true;
  }

  function validateAndToggleNext() {
    const id = app.order[app.idx];
    const ok = validate(id);
    nextBtn.disabled = !ok;
  }

  function goNext() {
    const id = app.order[app.idx];
    if (!validate(id)) { nextBtn.disabled = true; return; }
    // Persist
    try { localStorage.setItem('precon_answers', JSON.stringify(app.answers)); } catch {}

    // Move index; rebuild path because branching may change
    app.idx = Math.min(app.idx + 1, app.order.length - 1);
    buildPath();

    // If we landed past last question, go to review
    if (SCHEMA.questions[app.order[app.idx]]?.type === 'review') {
      renderReview();
    }
    render();
  }

  function goBack() {
    app.idx = Math.max(0, app.idx - 1);
    render();
  }

  function renderReview() {
    formEl.classList.add('hidden');
    reviewPanel.classList.remove('hidden');
    submitted.classList.add('hidden');

    // Build a readable summary
    const dl = document.createElement('dl');
    for (const id of Object.keys(SCHEMA.questions)) {
      if (id === 'review') continue;
      if (!app.order.includes(id)) continue; // only show visited
      const q = SCHEMA.questions[id];
      const ans = app.answers[id];
      if (ans == null || ans === '' || (Array.isArray(ans) && ans.length === 0)) continue;
      const dt = document.createElement('dt'); dt.textContent = q.label;
      const dd = document.createElement('dd'); dd.textContent = Array.isArray(ans) ? ans.join(', ') : String(ans);
      dl.appendChild(dt); dl.appendChild(dd);
    }
    reviewContent.innerHTML = '';
    reviewContent.appendChild(dl);
  }

  function submit() {
    const payload = {
      _meta: {
        title: SCHEMA.title,
        generatedAt: new Date().toISOString(),
        version: 'starter-v1'
      },
      answers: app.answers
    };
    output.value = JSON.stringify(payload, null, 2);
    reviewPanel.classList.add('hidden');
    submitted.classList.remove('hidden');
  }

  function copy() {
    output.select();
    document.execCommand('copy');
  }

  function download() {
    const blob = new Blob([output.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'preconsultation_answers.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function restart() {
    app.answers = {}; app.idx = 0; app.started = false; app.order = [];
    try { localStorage.removeItem('precon_answers'); } catch {}
    render();
  }

  // Wire buttons
  backBtn.addEventListener('click', goBack);
  nextBtn.addEventListener('click', goNext);
  reviewBackBtn.addEventListener('click', () => { app.idx = Math.max(0, app.order.length - 2); render(); });
  submitBtn.addEventListener('click', submit);
  copyBtn.addEventListener('click', copy);
  downloadBtn.addEventListener('click', download);
  restartBtn.addEventListener('click', restart);

  // Restore if present
  try {
    const saved = JSON.parse(localStorage.getItem('precon_answers') || 'null');
    if (saved && typeof saved === 'object') app.answers = saved;
  } catch {}

  // Initial render
  buildPath();
  // If order empty (fresh), set to start
  if (!app.order.length) { app.order = [SCHEMA.start]; }
  render();
})();