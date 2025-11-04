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
      // Webcam-assisted ocular dominance (diagnostic)
      // Two modes:
      //  - "hand" (default): detect aperture from thumb/index midpoint + iris centers
      //  - "target": use screen-center target; user aligns finger circle to center (no hand landmarks needed)
      const wrap = document.createElement('div');
      wrap.className = 'ocular-wrap';

      const info = document.createElement('div');
      info.className = 'help';
      info.textContent = 'Which is your dominant eye? If you do not know, please click on the tool to determine.';
      wrap.appendChild(info);

      // Controls
      const controls = document.createElement('div');
      controls.style.display = 'flex';
      controls.style.gap = '8px';
      const startBtn = document.createElement('button'); startBtn.type='button'; startBtn.className='btn primary'; startBtn.textContent='Enable camera (beta)';
      const stopBtn  = document.createElement('button'); stopBtn.type='button'; stopBtn.className='btn'; stopBtn.textContent='Stop'; stopBtn.disabled = true;
      const modeBtn  = document.createElement('button'); modeBtn.type='button'; modeBtn.className='btn'; modeBtn.textContent='Use on-screen target instead';
      // Calibration badge (hidden until locked)
      const calib = document.createElement('span');
      calib.textContent = 'Calibration succeeded ✓';
      calib.style.background = '#e8f5e9';
      calib.style.color = '#2e7d32';
      calib.style.border = '1px solid #a5d6a7';
      calib.style.padding = '4px 8px';
      calib.style.borderRadius = '9999px';
      calib.style.fontWeight = '600';
      calib.style.display = 'inline-flex';
      calib.style.alignItems = 'center';
      calib.style.gap = '6px';
      calib.hidden = true;
      // Result text — large and green for visibility
      const resultEl = document.createElement('div');
      resultEl.style.marginLeft='auto';
      resultEl.style.fontWeight='800';
      resultEl.style.fontSize='2rem';
      resultEl.style.lineHeight='1.2';
      resultEl.style.color='#2e7d32';
      resultEl.textContent='—';
      controls.append(startBtn, stopBtn, modeBtn, calib, resultEl);
      wrap.appendChild(controls);

      // Live instructions
      const tips = document.createElement('div');
      tips.className = 'notice';
      tips.textContent = 'HAND MODE: Hold a small circle with thumb+index 30–50 cm in front of your face, BETWEEN your face and the camera (not the screen). Keep both eyes open and look through the circle at the camera lens. Hold steady for 1–2 seconds.';
      wrap.appendChild(tips);

      // Status strip
      const status = document.createElement('div');
      status.style.fontSize = '0.95rem';
      status.style.opacity = '0.85';
      status.style.margin = '6px 0 2px';
      status.textContent = 'Face: ❌  Eyes: ❌  Hand: ❌  Stability: 0/20  Mode: hand';
      wrap.appendChild(status);

      // Video + overlay
      const stage = document.createElement('div');
      stage.style.position='relative'; stage.style.width='100%'; stage.style.maxWidth='560px'; stage.style.aspectRatio='4/3'; stage.style.border='2px solid var(--border)'; stage.style.borderRadius='12px'; stage.style.overflow='hidden'; stage.style.margin='10px 0';
      const video = document.createElement('video');
      video.autoplay = true; video.playsInline = true; video.muted = true; video.style.width='100%'; video.style.height='100%'; video.style.objectFit='cover';
      const overlay = document.createElement('canvas'); overlay.style.position='absolute'; overlay.style.left='0'; overlay.style.top='0'; overlay.style.width='100%'; overlay.style.height='100%'; overlay.style.pointerEvents='none';
      stage.append(video, overlay);
      wrap.appendChild(stage);

      // Minimal choice row (auto-set on detection)
      const choices = document.createElement('div');
      choices.className = 'options single';
      ['left','right','unsure'].forEach(v=>{
        const b=document.createElement('button'); b.type='button'; b.className='option'; b.dataset.value=v; b.textContent = v==='unsure' ? 'Not sure' : (v.charAt(0).toUpperCase()+v.slice(1));
        b.addEventListener('click', ()=>{ choices.querySelectorAll('.option').forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); app.answers[q.id]=v; saveAnswers(); });
        choices.appendChild(b);
      });
      wrap.appendChild(choices);

      // Detection state
      let stream=null, rafId=null, face=null, hands=null, lastWinner=null, stableCount=0, calibCount=0;
      let faceLM=null, handLM=null; // latest landmarks
      let mode = 'hand'; // 'hand' | 'target'
      let noFaceFrames=0, noHandFrames=0;

      function setMode(next){
        mode = next;
        status.textContent = status.textContent.replace(/Mode: .*/, 'Mode: ' + mode);
        if (mode === 'target') {
          tips.textContent = 'TARGET MODE: Align your finger circle with the center target on screen and look through it toward the camera. Hold steady for 1–2 seconds.';
          modeBtn.textContent = 'Use hand-circle mode instead';
        } else {
          tips.textContent = 'HAND MODE: Hold a small circle with thumb+index 30–50 cm in front of your face, BETWEEN your face and the camera (not the screen). Keep both eyes open and look through the circle at the camera lens. Hold steady for 1–2 seconds.';
          modeBtn.textContent = 'Use on-screen target instead';
        }
      }

      function select(val){
        const btn = choices.querySelector(`.option[data-value="${val}"]`);
        if (btn) { choices.querySelectorAll('.option').forEach(x=>x.classList.remove('selected')); btn.classList.add('selected'); }
        resultEl.textContent = `Likely: ${val==='unsure'?'Undetermined':val.charAt(0).toUpperCase()+val.slice(1)}`;
        app.answers[q.id] = val; saveAnswers();
      }

      function drawOverlay(ctx, W, H, points){
        ctx.clearRect(0,0,W,H);
        const cx=W/2, cy=H/2, r=Math.max(24, Math.min(W,H)/10);
        if (mode === 'target') {
          ctx.strokeStyle='#ff9800'; ctx.lineWidth=3; // center bullseye
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx-24,cy); ctx.lineTo(cx+24,cy); ctx.moveTo(cx,cy-24); ctx.lineTo(cx,cy+24); ctx.stroke();
        } else {
          ctx.strokeStyle='#ff9800'; ctx.lineWidth=3;
          ctx.beginPath(); ctx.rect(W*0.02, H*0.02, W*0.96, H*0.96); ctx.stroke();
        }
        // Points (aperture & eyes)
        if (points) {
          const { ax, ay, lx, ly, rx, ry } = points;
          ctx.fillStyle='rgba(26,115,232,0.95)'; // eyes
          if (isFinite(lx) && isFinite(ly)) { ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI*2); ctx.fill(); }
          if (isFinite(rx) && isFinite(ry)) { ctx.beginPath(); ctx.arc(rx, ry, 4, 0, Math.PI*2); ctx.fill(); }
          ctx.strokeStyle='rgba(244, 67, 54, 0.95)'; // aperture
          if (isFinite(ax) && isFinite(ay)) { ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI*2); ctx.stroke(); }
        }
      }

      // --- MediaPipe dynamic loader (Hands + FaceMesh with iris) ---
      const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe';
      function loadScript(src){ return new Promise((res, rej)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=res; s.onerror=()=>rej(new Error('load '+src)); document.head.appendChild(s); }); }
      async function ensureMediaPipe(){
        if (!window.Hands) await loadScript(`${MP_BASE}/hands/hands.js`);
        if (!window.FaceMesh) await loadScript(`${MP_BASE}/face_mesh/face_mesh.js`);
      }

      // Fallback FaceDetector (eyes approx) if MediaPipe blocked
      let faceDetector = null;
      function ensureFaceDetector(){
        if ('FaceDetector' in window) {
          try { faceDetector = new window.FaceDetector({ fastMode:true, maxDetectedFaces:1 }); } catch(_){}
        }
      }

      // Convert normalised landmark -> px
      function toPx(lm, W, H){ return { x: lm.x * W, y: lm.y * H }; }

      function irisCenters(landmarks, W, H){
        if (!landmarks || landmarks.length < 478) return null;
        const L = [468,469,470,471,472];
        const R = [473,474,475,476,477];
        const avg = (idxs)=>{
          let sx=0, sy=0; for (const i of idxs){ sx += landmarks[i].x; sy += landmarks[i].y; }
          return { x: (sx/idxs.length)*W, y: (sy/idxs.length)*H };
        };
        return { left: avg(L), right: avg(R) };
      }

      let frame = 0; // throttle heavy sends
      async function loop(){
        const ctx = overlay.getContext('2d');
        const W = overlay.width, H = overlay.height;
        const cx=W/2, cy=H/2;

        // Throttle sends
        frame = (frame+1)%2; // run every 2nd frame to reduce CPU
        if (frame===0) {
          try { if (face) await face.send({ image: video }); } catch(e){}
          try { if (hands) await hands.send({ image: video }); } catch(e){}
        }

        let ax=NaN, ay=NaN, lx=NaN, ly=NaN, rx=NaN, ry=NaN;

        // Eyes from FaceMesh or FaceDetector
        if (faceLM && faceLM.length) {
          const iris = irisCenters(faceLM, W, H);
          if (iris) { lx = iris.left.x; ly = iris.left.y; rx = iris.right.x; ry = iris.right.y; noFaceFrames=0; }
        } else if (faceDetector) {
          try {
            const faces = await faceDetector.detect(video);
            if (faces && faces[0]) {
              const f = faces[0]; const bb = f.boundingBox; const lm = f.landmarks||[];
              const lmkL = lm.find(m=> (m.type||'').toLowerCase().includes('left'));
              const lmkR = lm.find(m=> (m.type||'').toLowerCase().includes('right'));
              if (lmkL && lmkL.locations && lmkL.locations[0]) { lx = lmkL.locations[0].x; ly = lmkL.locations[0].y; }
              if (lmkR && lmkR.locations && lmkR.locations[0]) { rx = lmkR.locations[0].x; ry = lmkR.locations[0].y; }
              if (!isFinite(lx) || !isFinite(rx)) { // approximate eye centers from bbox
                lx = bb.x + bb.width*0.35; ly = bb.y + bb.height*0.42; rx = bb.x + bb.width*0.65; ry = bb.y + bb.height*0.42;
              }
              noFaceFrames=0;
            } else { noFaceFrames++; }
          } catch(_) { noFaceFrames++; }
        } else {
          noFaceFrames++;
        }

        // Aperture from Hands (thumb tip 4, index tip 8). In target mode, use center as aperture.
        if (mode==='hand') {
          if (handLM && handLM.length) {
            const h = handLM[0];
            const t = toPx(h[4], W, H);
            const i = toPx(h[8], W, H);
            ax = (t.x + i.x)/2; ay = (t.y + i.y)/2; noHandFrames=0;
          } else { noHandFrames++; }
        } else { ax = cx; ay = cy; noHandFrames=0; }

        drawOverlay(ctx, W, H, { ax, ay, lx, ly, rx, ry });

        // Status + guidance
        const haveEyes = isFinite(lx)&&isFinite(ly)&&isFinite(rx)&&isFinite(ry);
        const haveAperture = isFinite(ax)&&isFinite(ay);
        status.textContent = `Face: ${noFaceFrames<2?'✅':'❌'}  Eyes: ${haveEyes?'✅':'❌'}  Hand: ${mode==='hand'?(noHandFrames<2?'✅':'❌'):'—'}  Stability: ${Math.min(stableCount,20)}/20  Mode: ${mode}`;
        // Calibration badge: show when eyes + aperture visible for a short period
        if (haveEyes && haveAperture) { calibCount = Math.min(calibCount + 1, 30); } else { calibCount = 0; }
        calib.hidden = calibCount < 12;
        if (noFaceFrames>60) tips.textContent = 'Move closer and ensure good lighting. Keep your face centered in the frame.';
        else if (mode==='hand' && noHandFrames>60) tips.textContent = 'We can\'t see your hand circle. Bring it between your face and the CAMERA lens and make the circle smaller.';
        else if (haveEyes && haveAperture) tips.textContent = (mode==='hand' ? 'Hold steady. Detecting…' : 'Align the circle with the target and hold steady…');

        // Decide winner only when we have both eyes and an aperture
        if (haveEyes && haveAperture) {
          const dl = Math.hypot(ax - lx, ay - ly);
          const dr = Math.hypot(ax - rx, ay - ry); // FIXED bug: use rx for x
          const winner = (dl < dr) ? 'left' : 'right';
          if (winner === lastWinner) stableCount++; else { lastWinner = winner; stableCount = 1; }
          // require stability and a minimal distance gap
          if (stableCount > 20 && Math.abs(dl - dr) > 8) {
            select(winner);
          }
        }

        rafId = requestAnimationFrame(loop);
      }

      async function start(){
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          resultEl.textContent = 'Camera not supported in this browser/device.'; return;
        }
        try {
          // Start camera
          const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          stream = ms; video.srcObject = stream; await video.play();
          const setDims = () => { overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480; };
          if (video.readyState >= 2) setDims(); else video.addEventListener('loadedmetadata', setDims, { once:true });

          // Try to load MediaPipe; if blocked, fall back to FaceDetector + target mode
          let mpOk = true;
          try {
            await ensureMediaPipe();
            face = new window.FaceMesh({ locateFile: f => `${MP_BASE}/face_mesh/${f}` });
            face.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            face.onResults(res => { faceLM = (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) || null; });
            hands = new window.Hands({ locateFile: f => `${MP_BASE}/hands/${f}` });
            hands.setOptions({ maxNumHands: 2, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            hands.onResults(res => { handLM = res.multiHandLandmarks || null; });
          } catch (e) {
            mpOk = false;
          }
          if (!mpOk) {
            ensureFaceDetector();
            setMode('target');
            tips.textContent = 'TARGET MODE (fallback): Your browser blocked AI tracking. Align your finger circle with the center target and hold steady.';
          }

          startBtn.disabled = true; stopBtn.disabled = false;
          resultEl.textContent = mode==='hand' ? 'Show your hand circle between your face and camera. Look through it at the camera lens.' : 'Align your finger circle with the center target.';
          loop();
        } catch (e) {
          resultEl.textContent = 'Camera permission denied or unavailable.';
        }
      }

      function stop(){
        if (rafId) cancelAnimationFrame(rafId), rafId=null;
        if (stream) { stream.getTracks().forEach(t=>t.stop()); stream=null; }
        startBtn.disabled = false; stopBtn.disabled = true; resultEl.textContent = '—';
      }

      startBtn.addEventListener('click', start);
      stopBtn.addEventListener('click', stop);
      modeBtn.addEventListener('click', ()=> setMode(mode==='hand'?'target':'hand'));

      return wrap;
    }  const cx=W/2, cy=H/2;

        // Throttle sends
        frame = (frame+1)%2; // run every 2nd frame to reduce CPU
        if (frame===0) {
          try { if (face) await face.send({ image: video }); } catch(e){}
          try { if (hands) await hands.send({ image: video }); } catch(e){}
        }

        let ax=NaN, ay=NaN, lx=NaN, ly=NaN, rx=NaN, ry=NaN;

        // Eyes from FaceMesh or FaceDetector
        if (faceLM && faceLM.length) {
          const iris = irisCenters(faceLM, W, H);
          if (iris) { lx = iris.left.x; ly = iris.left.y; rx = iris.right.x; ry = iris.right.y; noFaceFrames=0; }
        } else if (faceDetector) {
          try {
            const faces = await faceDetector.detect(video);
            if (faces && faces[0]) {
              const f = faces[0]; const bb = f.boundingBox; const lm = f.landmarks||[];
              const lmkL = lm.find(m=> (m.type||'').toLowerCase().includes('left'));
              const lmkR = lm.find(m=> (m.type||'').toLowerCase().includes('right'));
              if (lmkL && lmkL.locations && lmkL.locations[0]) { lx = lmkL.locations[0].x; ly = lmkL.locations[0].y; }
              if (lmkR && lmkR.locations && lmkR.locations[0]) { rx = lmkR.locations[0].x; ry = lmkR.locations[0].y; }
              if (!isFinite(lx) || !isFinite(rx)) { // approximate eye centers from bbox
                lx = bb.x + bb.width*0.35; ly = bb.y + bb.height*0.42; rx = bb.x + bb.width*0.65; ry = bb.y + bb.height*0.42;
              }
              noFaceFrames=0;
            } else { noFaceFrames++; }
          } catch(_) { noFaceFrames++; }
        } else {
          noFaceFrames++;
        }

        // Aperture from Hands (thumb tip 4, index tip 8). In target mode, use center as aperture.
        if (mode==='hand') {
          if (handLM && handLM.length) {
            const h = handLM[0];
            const t = toPx(h[4], W, H);
            const i = toPx(h[8], W, H);
            ax = (t.x + i.x)/2; ay = (t.y + i.y)/2; noHandFrames=0;
          } else { noHandFrames++; }
        } else { ax = cx; ay = cy; noHandFrames=0; }

        drawOverlay(ctx, W, H, { ax, ay, lx, ly, rx, ry });

        // Status + guidance
        const haveEyes = isFinite(lx)&&isFinite(ly)&&isFinite(rx)&&isFinite(ry);
        const haveAperture = isFinite(ax)&&isFinite(ay);
        status.textContent = `Face: ${noFaceFrames<2?'✅':'❌'}  Eyes: ${haveEyes?'✅':'❌'}  Hand: ${mode==='hand'?(noHandFrames<2?'✅':'❌'):'—'}  Stability: ${Math.min(stableCount,20)}/20  Mode: ${mode}`;
        if (noFaceFrames>60) tips.textContent = 'Move closer and ensure good lighting. Keep your face centered in the frame.';
        else if (mode==='hand' && noHandFrames>60) tips.textContent = 'We can\'t see your hand circle. Bring it between your face and the CAMERA lens and make the circle smaller.';
        else if (haveEyes && haveAperture) tips.textContent = (mode==='hand' ? 'Hold steady. Detecting…' : 'Align the circle with the target and hold steady…');

        // Decide winner only when we have both eyes and an aperture
        if (haveEyes && haveAperture) {
          const dl = Math.hypot(ax - lx, ay - ly);
          const dr = Math.hypot(ax - rx, ay - ry); // FIXED bug: use rx for x
          const winner = (dl < dr) ? 'left' : 'right';
          if (winner === lastWinner) stableCount++; else { lastWinner = winner; stableCount = 1; }
          // require stability and a minimal distance gap
          if (stableCount > 20 && Math.abs(dl - dr) > 8) {
            select(winner);
          }
        }

        rafId = requestAnimationFrame(loop);
      }

      async function start(){
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          resultEl.textContent = 'Camera not supported in this browser/device.'; return;
        }
        try {
          // Start camera
          const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
          stream = ms; video.srcObject = stream; await video.play();
          const setDims = () => { overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480; };
          if (video.readyState >= 2) setDims(); else video.addEventListener('loadedmetadata', setDims, { once:true });

          // Try to load MediaPipe; if blocked, fall back to FaceDetector + target mode
          let mpOk = true;
          try {
            await ensureMediaPipe();
            face = new window.FaceMesh({ locateFile: f => `${MP_BASE}/face_mesh/${f}` });
            face.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            face.onResults(res => { faceLM = (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) || null; });
            hands = new window.Hands({ locateFile: f => `${MP_BASE}/hands/${f}` });
            hands.setOptions({ maxNumHands: 2, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
            hands.onResults(res => { handLM = res.multiHandLandmarks || null; });
          } catch (e) {
            mpOk = false;
          }
          if (!mpOk) {
            ensureFaceDetector();
            setMode('target');
            tips.textContent = 'TARGET MODE (fallback): Your browser blocked AI tracking. Align your finger circle with the center target and hold steady.';
          }

          startBtn.disabled = true; stopBtn.disabled = false;
          resultEl.textContent = mode==='hand' ? 'Show your hand circle between your face and camera. Look through it at the camera lens.' : 'Align your finger circle with the center target.';
          loop();
        } catch (e) {
          resultEl.textContent = 'Camera permission denied or unavailable.';
        }
      }

      function stop(){
        if (rafId) cancelAnimationFrame(rafId), rafId=null;
        if (stream) { stream.getTracks().forEach(t=>t.stop()); stream=null; }
        startBtn.disabled = false; stopBtn.disabled = true; resultEl.textContent = '—';
      }

      startBtn.addEventListener('click', start);
      stopBtn.addEventListener('click', stop);
      modeBtn.addEventListener('click', ()=> setMode(mode==='hand'?'target':'hand'));

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
  
        rec.onst
