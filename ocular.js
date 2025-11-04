// ocular.js — webcam-assisted ocular dominance tool (module)
// Exported API: mountOcularDominance({ container, question, save })
// - container: DOM element to render into
// - question: the schema question (id, help, etc.)
// - save(val): call with 'left' | 'right' | 'unsure' when a selection is made

export function mountOcularDominance({ container, question, save }) {
  // --- UI scaffolding ---
  container.innerHTML = '';

  const help = document.createElement('p');
  help.className = 'help';
  help.textContent = 'Which is your dominant eye? If you do not know, please click on the tool to determine.';
  container.appendChild(help);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '8px';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn primary';
  startBtn.textContent = 'Enable camera (beta)';

  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'btn';
  stopBtn.textContent = 'Stop';
  stopBtn.disabled = true;

  const modeBtn = document.createElement('button');
  modeBtn.type = 'button';
  modeBtn.className = 'btn';
  modeBtn.textContent = 'Use on-screen target instead';

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

  const resultEl = document.createElement('div');
  resultEl.style.marginLeft = 'auto';
  resultEl.style.fontWeight = '800';
  resultEl.style.fontSize = '2rem';
  resultEl.style.lineHeight = '1.2';
  resultEl.style.color = '#2e7d32';
  resultEl.textContent = '—';

  controls.append(startBtn, stopBtn, modeBtn, calib, resultEl);
  container.appendChild(controls);

  const tips = document.createElement('div');
  tips.className = 'notice';
  tips.textContent = 'HAND MODE: Hold a small circle with thumb+index 30–50 cm in front of your face, BETWEEN your face and the camera (not the screen). Keep both eyes open and look through the circle at the camera lens. Hold steady for 1–2 seconds.';
  container.appendChild(tips);

  const status = document.createElement('div');
  status.style.fontSize = '0.95rem';
  status.style.opacity = '0.85';
  status.style.margin = '6px 0 2px';
  status.textContent = 'Face: ❌  Eyes: ❌  Hand: ❌  Stability: 0/20  Mode: hand';
  container.appendChild(status);

  const stage = document.createElement('div');
  stage.style.position = 'relative';
  stage.style.width = '100%';
  stage.style.maxWidth = '560px';
  stage.style.aspectRatio = '4/3';
  stage.style.border = '2px solid var(--border)';
  stage.style.borderRadius = '12px';
  stage.style.overflow = 'hidden';
  stage.style.margin = '10px 0';
  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.muted = true; video.style.width = '100%'; video.style.height = '100%'; video.style.objectFit = 'cover';
  const overlay = document.createElement('canvas');
  overlay.style.position = 'absolute'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.width = '100%'; overlay.style.height = '100%'; overlay.style.pointerEvents = 'none';
  stage.append(video, overlay);
  container.appendChild(stage);

  // Keep standard answer buttons so the host app's readAnswer() works
  const choices = document.createElement('div');
  choices.className = 'options single';
  ['left', 'right', 'unsure'].forEach(v => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'option'; b.dataset.value = v;
    b.textContent = (v === 'unsure') ? 'Not sure' : (v[0].toUpperCase() + v.slice(1));
    b.addEventListener('click', () => {
      choices.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
      save(v);
    });
    choices.appendChild(b);
  });
  container.appendChild(choices);

  // --- Detection state ---
  let stream = null, rafId = null, face = null, hands = null, faceDetector = null;
  let lastWinner = null, stableCount = 0, calibCount = 0;
  let faceLM = null, handLM = null;
  let mode = 'hand'; // 'hand' | 'target'
  let noFaceFrames = 0, noHandFrames = 0;

  function setMode(next) {
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

  function select(val) {
    const btn = choices.querySelector(`.option[data-value="${val}"]`);
    if (btn) {
      choices.querySelectorAll('.option').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
    }
    resultEl.textContent = `Likely: ${val === 'unsure' ? 'Undetermined' : val[0].toUpperCase() + val.slice(1)}`;
    save(val);
  }

  function drawOverlay(ctx, W, H, points) {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, r = Math.max(24, Math.min(W, H) / 10);
    if (mode === 'target') {
      ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 3; // center bullseye
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 24, cy); ctx.lineTo(cx + 24, cy); ctx.moveTo(cx, cy - 24); ctx.lineTo(cx, cy + 24); ctx.stroke();
    } else {
      ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(W * 0.02, H * 0.02, W * 0.96, H * 0.96); ctx.stroke();
    }
    if (points) {
      const { ax, ay, lx, ly, rx, ry } = points;
      ctx.fillStyle = 'rgba(26,115,232,0.95)'; // eyes
      if (isFinite(lx) && isFinite(ly)) { ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill(); }
      if (isFinite(rx) && isFinite(ry)) { ctx.beginPath(); ctx.arc(rx, ry, 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(244, 67, 54, 0.95)'; // aperture
      if (isFinite(ax) && isFinite(ay)) { ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  // MediaPipe loader
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe';
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
  async function ensureMediaPipe() {
    if (!window.Hands) await loadScript(`${MP_BASE}/hands/hands.js`);
    if (!window.FaceMesh) await loadScript(`${MP_BASE}/face_mesh/face_mesh.js`);
  }
  function ensureFaceDetector() {
    if ('FaceDetector' in window) { try { faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); } catch { faceDetector = null; } }
  }
  function toPx(lm, W, H) { return { x: lm.x * W, y: lm.y * H }; }
  function irisCenters(landmarks, W, H) {
    if (!landmarks || landmarks.length < 478) return null;
    const L = [468, 469, 470, 471, 472];
    const R = [473, 474, 475, 476, 477];
    const avg = (idxs) => {
      let sx = 0, sy = 0; for (const i of idxs) { sx += landmarks[i].x; sy += landmarks[i].y; }
      return { x: (sx / idxs.length) * W, y: (sy / idxs.length) * H };
    };
    return { left: avg(L), right: avg(R) };
  }

  let frame = 0;
  async function loop() {
    const ctx = overlay.getContext('2d');
    const W = overlay.width, H = overlay.height;
    const cx = W / 2, cy = H / 2;

    frame = (frame + 1) % 2;
    if (frame === 0) {
      try { if (face) await face.send({ image: video }); } catch {}
      try { if (hands) await hands.send({ image: video }); } catch {}
    }

    let ax = NaN, ay = NaN, lx = NaN, ly = NaN, rx = NaN, ry = NaN;

    if (faceLM && faceLM.length) {
      const iris = irisCenters(faceLM, W, H);
      if (iris) { lx = iris.left.x; ly = iris.left.y; rx = iris.right.x; ry = iris.right.y; noFaceFrames = 0; }
    } else if (faceDetector) {
      try {
        const faces = await faceDetector.detect(video);
        if (faces && faces[0]) {
          const f = faces[0]; const bb = f.boundingBox; const lm = f.landmarks || [];
          const lmkL = lm.find(m => (m.type || '').toLowerCase().includes('left'));
          const lmkR = lm.find(m => (m.type || '').toLowerCase().includes('right'));
          if (lmkL && lmkL.locations && lmkL.locations[0]) { lx = lmkL.locations[0].x; ly = lmkL.locations[0].y; }
          if (lmkR && lmkR.locations && lmkR.locations[0]) { rx = lmkR.locations[0].x; ry = lmkR.locations[0].y; }
          if (!isFinite(lx) || !isFinite(rx)) { lx = bb.x + bb.width * 0.35; ly = bb.y + bb.height * 0.42; rx = bb.x + bb.width * 0.65; ry = bb.y + bb.height * 0.42; }
          noFaceFrames = 0;
        } else { noFaceFrames++; }
      } catch { noFaceFrames++; }
    } else {
      noFaceFrames++;
    }

    if (mode === 'hand') {
      if (handLM && handLM.length) {
        const h = handLM[0];
        const t = toPx(h[4], W, H);
        const i = toPx(h[8], W, H);
        ax = (t.x + i.x) / 2; ay = (t.y + i.y) / 2; noHandFrames = 0;
      } else { noHandFrames++; }
    } else { ax = cx; ay = cy; noHandFrames = 0; }

    drawOverlay(ctx, W, H, { ax, ay, lx, ly, rx, ry });

    const haveEyes = isFinite(lx) && isFinite(ly) && isFinite(rx) && isFinite(ry);
    const haveAperture = isFinite(ax) && isFinite(ay);
    status.textContent = `Face: ${noFaceFrames < 2 ? '✅' : '❌'}  Eyes: ${haveEyes ? '✅' : '❌'}  Hand: ${mode === 'hand' ? (noHandFrames < 2 ? '✅' : '❌') : '—'}  Stability: ${Math.min(stableCount, 20)}/20  Mode: ${mode}`;
    if (haveEyes && haveAperture) { calibCount = Math.min(calibCount + 1, 30); } else { calibCount = 0; }
    calib.hidden = calibCount < 12;

    if (noFaceFrames > 60) tips.textContent = 'Move closer and ensure good lighting. Keep your face centered in the frame.';
    else if (mode === 'hand' && noHandFrames > 60) tips.textContent = 'We can\'t see your hand circle. Bring it between your face and the CAMERA lens and make the circle smaller.';
    else if (haveEyes && haveAperture) tips.textContent = (mode === 'hand' ? 'Hold steady. Detecting…' : 'Align the circle with the target and hold steady…');

    if (haveEyes && haveAperture) {
      const dl = Math.hypot(ax - lx, ay - ly);
      const dr = Math.hypot(ax - rx, ay - ry);
      const winner = (dl < dr) ? 'left' : 'right';
      if (winner === lastWinner) stableCount++; else { lastWinner = winner; stableCount = 1; }
      if (stableCount > 20 && Math.abs(dl - dr) > 8) select(winner);
    }

    rafId = requestAnimationFrame(loop);
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      resultEl.textContent = 'Camera not supported in this browser/device.'; return;
    }
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      stream = ms; video.srcObject = stream; await video.play();
      const setDims = () => { overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480; };
      if (video.readyState >= 2) setDims(); else video.addEventListener('loadedmetadata', setDims, { once: true });

      let mpOk = true;
      try {
        await ensureMediaPipe();
        face = new window.FaceMesh({ locateFile: f => `${MP_BASE}/face_mesh/${f}` });
        face.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        face.onResults(res => { faceLM = (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) || null; });
        hands = new window.Hands({ locateFile: f => `${MP_BASE}/hands/${f}` });
        hands.setOptions({ maxNumHands: 2, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        hands.onResults(res => { handLM = res.multiHandLandmarks || null; });
      } catch { mpOk = false; }

      if (!mpOk) {
        ensureFaceDetector();
        setMode('target');
        tips.textContent = 'TARGET MODE (fallback): Your browser blocked AI tracking. Align your finger circle with the center target and hold steady.';
      }

      startBtn.disabled = true; stopBtn.disabled = false;
      resultEl.textContent = mode === 'hand' ? 'Show your hand circle between your face and camera. Look through it at the camera lens.' : 'Align your finger circle with the center target.';
      loop();
    } catch {
      resultEl.textContent = 'Camera permission denied or unavailable.';
    }
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId), rafId = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    startBtn.disabled = false; stopBtn.disabled = true; resultEl.textContent = '—';
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  modeBtn.addEventListener('click', () => setMode(mode === 'hand' ? 'target' : 'hand'));
}
