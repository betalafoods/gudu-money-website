/* Sonu Marketing · Loans by the Sea
   - Cinematic ocean hero: 4K footage, dolly-in, pointer parallax, drifting sea spray.
   - Sound: music + synthesised surf. Browsers only allow sound after a first tap or key,
     so we try immediately and otherwise start on the first interaction.
   - Ananya: a guide who asks questions aloud (speech synthesis) with captions.
     Nothing the visitor types leaves the browser. */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  document.documentElement.classList.add('js');

  const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const rupees = (n) => '₹' + inr.format(Math.round(n));

  /* ------------------------------------------------------------------ */
  /* Hero: footage                                                       */
  /* ------------------------------------------------------------------ */
  const hero = $('.hero');
  const sea = $('#sea');
  const saveData = navigator.connection && navigator.connection.saveData;
  const longEdge = Math.max(screen.width, screen.height) * Math.min(devicePixelRatio || 1, 2);
  sea.src = 'sea-hd.mp4';
  sea.playbackRate = 0.85; // a touch slower reads as more cinematic
  sea.addEventListener('loadeddata', () => { sea.playbackRate = 0.85; });
  sea.play().catch(() => {});

  requestAnimationFrame(() => setTimeout(() => hero.classList.add('opened'), 150));

  // Pause footage when the hero is out of view.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) sea.play().catch(() => {});
    else sea.pause();
  }, { threshold: 0.02 }).observe(hero);

  /* Camera: slow dolly-in plus pointer parallax */
  const copy = $('.hero-copy');
  const pointer = { x: 0, y: 0 };
  const cam = { x: 0, y: 0 };
  const t0 = performance.now();
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    pointer.x = Math.max(-1, Math.min(1, e.gamma / 25));
    pointer.y = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
  }, { passive: true });

  function camera(now) {
    const t = (now - t0) / 1000;
    const dolly = reduceMotion ? 1 : 1 + 0.22 * Math.exp(-t / 3.2) + 0.012 * Math.sin(t / 4);
    cam.x += (pointer.x - cam.x) * 0.04;
    cam.y += (pointer.y - cam.y) * 0.04;
    const k = reduceMotion ? 0 : 1;
    sea.style.transform =
      `translate3d(${(-cam.x * 22 * k).toFixed(2)}px, ${(-cam.y * 14 * k).toFixed(2)}px, 0) ` +
      `rotateY(${(cam.x * 1.6 * k).toFixed(3)}deg) rotateX(${(-cam.y * 1.1 * k).toFixed(3)}deg) scale(${dolly.toFixed(4)})`;
    copy.style.transform = `translate3d(${(cam.x * 10 * k).toFixed(2)}px, ${(cam.y * 6 * k).toFixed(2)}px, 0)`;
    hero.style.setProperty('--sun-x', `${46 - cam.x * 3}%`);
    hero.style.setProperty('--sun-y', `${38 - cam.y * 2}%`);
    requestAnimationFrame(camera);
  }
  requestAnimationFrame(camera);

  /* Sea spray and light motes, drawn at three depths */
  const canvas = $('#spray');
  const ctx2d = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, motes = [];
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(hero.clientWidth * dpr);
    H = canvas.height = Math.round(hero.clientHeight * dpr);
    const count = Math.round(Math.min(140, (hero.clientWidth * hero.clientHeight) / 12000));
    motes = Array.from({ length: count }, () => spawn(true));
  }
  function spawn(anywhere) {
    const z = 0.25 + Math.random() * 0.75;
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : H * (0.75 + Math.random() * 0.3),
      z,
      r: (0.6 + Math.random() * 2.4) * z * dpr,
      vx: (0.08 + Math.random() * 0.25) * dpr,
      vy: -(0.05 + Math.random() * 0.22) * dpr,
      a: 0.15 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
    };
  }
  let last = performance.now();
  function spray(now) {
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      if (!reduceMotion) {
        m.x += m.vx * m.z * dt;
        m.y += m.vy * m.z * dt + Math.sin(now / 1400 + m.phase) * 0.12 * dpr;
      }
      if (m.x > W + 20 || m.y < -20) Object.assign(m, spawn(false), { x: Math.random() * W * 0.9 });
      const px = m.x - cam.x * 40 * m.z * dpr;
      const py = m.y - cam.y * 24 * m.z * dpr;
      const twinkle = 0.65 + 0.35 * Math.sin(now / 700 + m.phase);
      const g = ctx2d.createRadialGradient(px, py, 0, px, py, m.r * 3);
      g.addColorStop(0, `rgba(255, 238, 210, ${m.a * twinkle})`);
      g.addColorStop(1, 'rgba(255, 238, 210, 0)');
      ctx2d.fillStyle = g;
      ctx2d.beginPath();
      ctx2d.arc(px, py, m.r * 3, 0, Math.PI * 2);
      ctx2d.fill();
    }
    requestAnimationFrame(spray);
  }
  resize();
  addEventListener('resize', resize);
  requestAnimationFrame(spray);

  /* ------------------------------------------------------------------ */
  /* Sound                                                               */
  /* ------------------------------------------------------------------ */
  const music = $('#music');
  const soundBtn = $('#soundBtn');
  const soundLabel = $('#soundLabel');
  const tapHint = $('#tapHint');
  let soundOn = false;
  let userMuted = store.get('sonu-sound') === 'off';
  let actx = null;
  let surfOut = null;
  let synthOut = null;
  let musicFileOk = true;

  music.addEventListener('error', () => { musicFileOk = false; if (soundOn) startSynthMusic(); });

  function fadeMedia(el, to, ms, done) {
    const from = el.volume;
    const start = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - start) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    })(start);
  }

  function audioContext() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  // Surf: brown noise, swelling like breaking waves every ~11 seconds.
  function startSurf() {
    const ac = audioContext();
    if (!ac) return;
    if (!surfOut) {
      const len = ac.sampleRate * 6;
      const buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let b = 0;
        for (let i = 0; i < len; i++) {
          b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          d[i] = b * 3.2;
        }
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 650;
      const swell = ac.createGain();
      swell.gain.value = 0.5;
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = 0.42;
      const lfoFreq = ac.createGain();
      lfoFreq.gain.value = 420;
      lfo.connect(lfoGain).connect(swell.gain);
      lfo.connect(lfoFreq).connect(lp.frequency);
      surfOut = ac.createGain();
      surfOut.gain.value = 0;
      src.connect(lp).connect(swell).connect(surfOut).connect(ac.destination);
      src.start();
      lfo.start();
    }
    surfOut.gain.cancelScheduledValues(ac.currentTime);
    surfOut.gain.setTargetAtTime(0.32, ac.currentTime, 1.2);
  }

  // Fallback score if the music file can't load: slow warm pads.
  function startSynthMusic() {
    const ac = audioContext();
    if (!ac || synthOut) { if (synthOut && ac) synthOut.gain.setTargetAtTime(0.18, ac.currentTime, 1.5); return; }
    synthOut = ac.createGain();
    synthOut.gain.value = 0;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.42;
    const fb = ac.createGain();
    fb.gain.value = 0.35;
    delay.connect(fb).connect(delay);
    lp.connect(synthOut);
    lp.connect(delay).connect(synthOut);
    synthOut.connect(ac.destination);
    const chords = [[48, 55, 64, 71], [45, 52, 60, 67, 71], [41, 48, 57, 64], [43, 50, 59, 64]];
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const bar = 6;
    let i = 0;
    const play = () => {
      const now = ac.currentTime;
      chords[i % chords.length].forEach((m, j) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = j === 0 ? 'sine' : 'triangle';
        o.frequency.value = hz(m);
        o.detune.value = (Math.random() - 0.5) * 8;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(j === 0 ? 0.16 : 0.06, now + 2);
        g.gain.linearRampToValueAtTime(0, now + bar + 1.5);
        o.connect(g).connect(lp);
        o.start(now);
        o.stop(now + bar + 2);
        // a soft plucked note on top
        if (j === chords[i % chords.length].length - 1) {
          const p = ac.createOscillator();
          const pg = ac.createGain();
          p.type = 'sine';
          p.frequency.value = hz(m + 12);
          pg.gain.setValueAtTime(0, now + 1.5);
          pg.gain.linearRampToValueAtTime(0.05, now + 1.55);
          pg.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
          p.connect(pg).connect(lp);
          p.start(now + 1.5);
          p.stop(now + 5);
        }
      });
      i++;
    };
    play();
    setInterval(() => { if (ac.state === 'running') play(); }, bar * 1000);
    synthOut.gain.setTargetAtTime(0.18, ac.currentTime, 1.5);
  }

  function renderSound() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    soundLabel.textContent = soundOn ? 'Sound on' : 'Sound off';
    tapHint.hidden = soundOn || userMuted;
  }

  function soundUp() {
    soundOn = true;
    renderSound();
    startSurf();
    if (musicFileOk) {
      music.volume = 0;
      music.play().then(() => fadeMedia(music, 0.5, 3500)).catch(() => { musicFileOk = false; startSynthMusic(); });
    } else {
      startSynthMusic();
    }
  }

  function soundDown() {
    soundOn = false;
    renderSound();
    fadeMedia(music, 0, 900, () => music.pause());
    if (actx && surfOut) surfOut.gain.setTargetAtTime(0, actx.currentTime, 0.4);
    if (actx && synthOut) synthOut.gain.setTargetAtTime(0, actx.currentTime, 0.4);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    guideEl.classList.remove('is-speaking');
  }

  soundBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (soundOn) { userMuted = true; store.set('sonu-sound', 'off'); soundDown(); }
    else { userMuted = false; store.set('sonu-sound', 'on'); soundUp(); if (guide.current) guide.repeat(); }
  });

  // Try right away. Most browsers refuse sound before a gesture; then we wait for one.
  if (!userMuted) {
    music.volume = 0;
    music.play()
      .then(() => { soundOn = true; renderSound(); fadeMedia(music, 0.5, 4000); startSurf(); })
      .catch(() => { renderSound(); });
  } else {
    renderSound();
  }

  let firstGesture = false;
  function onFirstGesture(e) {
    if (firstGesture) return;
    firstGesture = true;
    ['pointerdown', 'keydown', 'touchend'].forEach((t) => removeEventListener(t, onFirstGesture, true));
    if (!userMuted && !soundOn && !(e && e.target && e.target.closest && e.target.closest('#soundBtn'))) soundUp();
    if (actx) actx.resume().catch(() => {});
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((t) => addEventListener(t, onFirstGesture, true));

  /* ------------------------------------------------------------------ */
  /* Ananya                                                              */
  /* ------------------------------------------------------------------ */
  const guideEl = $('#guide');
  const captionEl = $('#caption');
  const answerEl = $('#answer');
  const progressEl = $('#progress');
  const ananyaVideo = $('#ananyaVideo');

  let lang = store.get('sonu-lang') === 'hi' ? 'hi' : 'en';

  const T = {
    en: {
      name: 'What should I call you?',
      namePh: 'Your first name',
      next: 'Next',
      again: 'Start again',
      calc: 'Open the EMI calculator',
      offerTitle: 'Your illustrative estimate',
      amount: 'Loan amount', tenure: 'Repay over', emi: 'Monthly EMI', rate: 'Rate used (illustrative)', months: 'months',
    },
    hi: {
      name: 'मैं आपको किस नाम से बुलाऊँ?',
      namePh: 'आपका पहला नाम',
      next: 'आगे',
      again: 'फिर से शुरू करें',
      calc: 'EMI कैलकुलेटर खोलें',
      offerTitle: 'आपका अनुमान (उदाहरण)',
      amount: 'लोन राशि', tenure: 'चुकाने की अवधि', emi: 'मासिक EMI', rate: 'दर (उदाहरण)', months: 'महीने',
    },
  };

  const RATE = 24; // % p.a., illustration only

  const steps = [
    {
      id: 'name', type: 'text',
      say: {
        en: () => "Hello, I'm Ananya from Sonu Marketing. I'll ask you a few quick questions and show you an honest estimate. First, what should I call you?",
        hi: () => 'नमस्ते, मैं सोनू मार्केटिंग से अनन्या हूँ। मैं आपसे कुछ आसान सवाल पूछूँगी और आपको एक सच्चा अनुमान दिखाऊँगी। सबसे पहले, मैं आपको किस नाम से बुलाऊँ?',
      },
    },
    {
      id: 'purpose', type: 'chips',
      say: {
        en: (a) => `Lovely to meet you, ${a.name}. What do you need the money for?`,
        hi: (a) => `आपसे मिलकर अच्छा लगा, ${a.name}। आपको पैसों की ज़रूरत किस लिए है?`,
      },
      options: [['medical', 'Medical', 'इलाज'], ['education', 'Education', 'पढ़ाई'], ['home', 'Home repair', 'घर की मरम्मत'], ['wedding', 'Wedding', 'शादी'], ['business', 'Business', 'व्यापार'], ['other', 'Something else', 'कुछ और']],
    },
    {
      id: 'amount', type: 'slider', min: 5000, max: 200000, step: 1000, value: 50000, fmt: rupees,
      say: {
        en: (a) => a.purpose === 'medical' ? "I hope everyone is alright. How much would help?" : 'Got it. How much would help?',
        hi: (a) => a.purpose === 'medical' ? 'उम्मीद है सब ठीक है। कितनी रकम से मदद होगी?' : 'समझ गई। कितनी रकम से मदद होगी?',
      },
    },
    {
      id: 'work', type: 'chips',
      say: { en: () => 'How do you earn your income?', hi: () => 'आपकी आमदनी कैसे होती है?' },
      options: [['salaried', 'Salaried', 'नौकरी'], ['self', 'Self-employed', 'स्वरोज़गार'], ['business', 'Own a business', 'अपना व्यापार']],
    },
    {
      id: 'income', type: 'slider', min: 10000, max: 300000, step: 1000, value: 35000, fmt: rupees,
      say: { en: () => 'Roughly how much comes in each month?', hi: () => 'हर महीने लगभग कितनी आमदनी होती है?' },
    },
    {
      id: 'tenure', type: 'chips',
      say: { en: () => 'Last one. Over how many months would you like to repay?', hi: () => 'आख़िरी सवाल। आप कितने महीनों में चुकाना चाहेंगे?' },
      options: [['3', '3 months', '3 महीने'], ['6', '6 months', '6 महीने'], ['12', '12 months', '12 महीने'], ['24', '24 months', '24 महीने']],
    },
  ];

  function emiFor(principal, months, annualRate) {
    const r = annualRate / 1200;
    if (r === 0) return principal / months;
    const f = Math.pow(1 + r, months);
    return (principal * r * f) / (f - 1);
  }

  function estimate(a) {
    const n = Number(a.tenure);
    const r = RATE / 1200;
    const maxEmi = a.income * 0.4; // keep repayments within ~40% of monthly income
    const affordable = maxEmi * (1 - Math.pow(1 + r, -n)) / r;
    const amount = Math.max(5000, Math.floor(Math.min(a.amount, affordable) / 1000) * 1000);
    return { amount, n, emi: emiFor(amount, n, RATE), trimmed: amount < a.amount };
  }

  /* voice */
  let voices = [];
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.addEventListener('voiceschanged', loadVoices); }
  const FEMALE = /female|woman|heera|neerja|swara|kalpana|aditi|raveena|veena|lekha|priya|zira|samantha|susan|hazel|libby|sonia|aria|jenny|natasha|google (uk english female|हिन्दी)/i;
  const MALE = /\b(male|ravi|hemant|prabhat|madhur|david|mark|george|guy|ryan|daniel|rishi)\b/i;
  function pickVoice(l) {
    const prefs = l === 'hi' ? ['hi-in'] : ['en-in', 'en-gb', 'en-us', 'en'];
    for (const p of prefs) {
      const pool = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(p));
      const f = pool.find((v) => FEMALE.test(v.name)) || pool.find((v) => !MALE.test(v.name));
      if (f) return f;
    }
    return voices.find((v) => FEMALE.test(v.name)) || null;
  }
  const spoken = (text) => text.replace(/₹\s?([\d,]+)/g, (_, n) => `${n} ${lang === 'hi' ? 'रुपये' : 'rupees'}`).replace(/EMI/g, 'E M I');

  let typing = 0;
  function caption(text) {
    ++typing;
    captionEl.textContent = text;
  }

  function say(text, then) {
    caption(text);
    const canSpeak = soundOn && 'speechSynthesis' in window;
    if (!canSpeak) { setTimeout(() => then && then(), reduceMotion ? 0 : Math.min(1800, text.length * 22)); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(spoken(text));
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = v ? v.lang : (lang === 'hi' ? 'hi-IN' : 'en-IN');
    u.rate = lang === 'hi' ? 0.95 : 0.98;
    u.pitch = 1.08;
    let finished = false;
    const done = () => { if (finished) return; finished = true; guideEl.classList.remove('is-speaking'); if (music.volume < 0.5 && soundOn) fadeMedia(music, 0.5, 800); then && then(); };
    u.onstart = () => { guideEl.classList.add('is-speaking'); if (soundOn) fadeMedia(music, 0.18, 500); };
    u.onend = done;
    u.onerror = done;
    // Answers unlock after a short beat even if the voice engine never reports "end".
    setTimeout(() => { if (!finished) then && then(); then = null; }, Math.min(2500, text.length * 30));
    speechSynthesis.speak(u);
  }

  const guide = {
    step: 0,
    answers: {},
    current: null,
    open() {
      if (!guideEl.hidden) return;
      guideEl.hidden = false;
      ananyaVideo.play().catch(() => {});
      this.render();
    },
    close() {
      clearTimeout(guideTimer);
      ++typing;
      guideEl.hidden = true;
      ananyaVideo.pause();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      guideEl.classList.remove('is-speaking');
    },
    repeat() { if (!guideEl.hidden) this.render(); },
    progress() {
      progressEl.innerHTML = '';
      steps.forEach((_, i) => {
        const li = document.createElement('li');
        if (i < this.step) li.className = 'done';
        progressEl.appendChild(li);
      });
    },
    render() {
      this.progress();
      answerEl.innerHTML = '';
      answerEl.dataset.state = 'waiting';
      if (this.step >= steps.length) return this.result();
      const s = steps[this.step];
      this.current = s;
      say(s.say[lang](this.answers), () => { answerEl.dataset.state = 'ready'; const f = answerEl.querySelector('input, button'); if (f && matchMedia('(pointer: fine)').matches) f.focus({ preventScroll: true }); });
      this.buildInput(s);
    },
    buildInput(s) {
      const t = T[lang];
      if (s.type === 'text') {
        answerEl.innerHTML = `<input type="text" name="v" maxlength="30" placeholder="${t.namePh}" aria-label="${t.name}" value="${escapeHtml(this.answers.name || '')}">
          <div class="row"><span></span><button class="btn btn-gold btn-sm send" type="submit">${t.next}</button></div>`;
        answerEl.onsubmit = (e) => {
          e.preventDefault();
          const v = answerEl.v.value.trim().replace(/[^\p{L}\s.'-]/gu, '').slice(0, 30);
          if (!v) { answerEl.v.focus(); return; }
          this.answer(s.id, v.split(/\s+/)[0]);
        };
      } else if (s.type === 'chips') {
        answerEl.onsubmit = (e) => e.preventDefault();
        const wrap = document.createElement('div');
        wrap.className = 'chips';
        s.options.forEach(([value, en, hi]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chip';
          b.textContent = lang === 'hi' ? hi : en;
          b.addEventListener('click', () => this.answer(s.id, value));
          wrap.appendChild(b);
        });
        answerEl.appendChild(wrap);
      } else if (s.type === 'slider') {
        const val = this.answers[s.id] || s.value;
        answerEl.innerHTML = `<div class="row"><output class="slider-out num"></output><button class="btn btn-gold btn-sm send" type="submit">${t.next}</button></div>
          <input type="range" name="v" min="${s.min}" max="${s.max}" step="${s.step}" value="${val}" aria-label="${s.id}">`;
        const input = answerEl.v;
        const out = answerEl.querySelector('output');
        const sync = () => { out.textContent = s.fmt(Number(input.value)); fill(input); };
        input.addEventListener('input', sync);
        sync();
        answerEl.onsubmit = (e) => { e.preventDefault(); this.answer(s.id, Number(input.value)); };
      }
    },
    answer(id, value) {
      this.answers[id] = value;
      this.step++;
      this.render();
    },
    result() {
      const t = T[lang];
      const a = this.answers;
      const est = estimate(a);
      const line = lang === 'hi'
        ? `${a.name}, आपने जो बताया उसके हिसाब से, लगभग ${rupees(est.amount)} ${est.n} महीनों के लिए, करीब ${rupees(est.emi)} महीना।${est.trimmed ? ' मैंने राशि थोड़ी कम रखी है ताकि किस्त आपकी आमदनी के अंदर रहे।' : ''} यह सिर्फ़ एक अनुमान है — असली ऑफ़र जाँच के बाद, साइन करने से पहले की फ़ैक्ट्स स्टेटमेंट के साथ मिलता है।`
        : `${a.name}, based on what you've told me, about ${rupees(est.amount)} over ${est.n} months, at roughly ${rupees(est.emi)} a month.${est.trimmed ? " I've kept the amount a little lower so the instalment stays comfortable for your income." : ''} This is only an estimate. A real offer comes after verification, with a Key Facts Statement before you sign anything.`;
      answerEl.onsubmit = (e) => e.preventDefault();
      answerEl.innerHTML = `
        <div class="offer">
          <span style="font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;opacity:.8">${t.offerTitle}</span>
          <span class="offer-amount num">${rupees(est.amount)}</span>
          <dl>
            <dt>${t.tenure}</dt><dd class="num">${est.n} ${t.months}</dd>
            <dt>${t.emi}</dt><dd class="num">${rupees(est.emi)}</dd>
            <dt>${t.rate}</dt><dd class="num">${RATE}% p.a.</dd>
          </dl>
        </div>
        <div class="row">
          <button type="button" class="btn btn-ghost btn-sm" data-act="again">${t.again}</button>
          <button type="button" class="btn btn-gold btn-sm" data-act="calc">${t.calc}</button>
        </div>`;
      answerEl.querySelector('[data-act="again"]').addEventListener('click', () => { this.step = 0; this.answers = {}; this.render(); });
      answerEl.querySelector('[data-act="calc"]').addEventListener('click', () => {
        setCalc(est.amount, est.n);
        this.close();
        document.getElementById('emi').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      });
      say(line, () => { answerEl.dataset.state = 'ready'; });
    },
  };

  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function setLang(l) {
    lang = l;
    store.set('sonu-lang', l);
    guideEl.lang = l;
    $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    guide.repeat();
  }
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));

  let guideTimer = 0;
  function scheduleGuide(ms) {
    if (store.get('sonu-guide') === 'closed') return;
    clearTimeout(guideTimer);
    guideTimer = setTimeout(() => guide.open(), ms);
  }
  $$('[data-open-guide]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    store.set('sonu-guide', 'open');
    clearTimeout(guideTimer);
    if (!firstGesture) onFirstGesture(e);
    if (guideEl.hidden) guide.open(); else guide.repeat();
  }));
  $('#guideClose').addEventListener('click', () => { store.set('sonu-guide', 'closed'); guide.close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !guideEl.hidden) guide.close(); });

  // Ananya walks in on her own after the opening shot, even before anyone taps.
  guideEl.lang = lang;

  /* ------------------------------------------------------------------ */
  /* EMI calculator                                                      */
  /* ------------------------------------------------------------------ */
  const amountIn = $('#emiAmount');
  const tenureIn = $('#emiTenure');
  const rateIn = $('#emiRate');

  function fill(input) {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', `${p}%`);
  }

  function calc() {
    const P = Number(amountIn.value);
    const n = Number(tenureIn.value);
    const rate = Number(rateIn.value);
    const emi = emiFor(P, n, rate);
    const total = emi * n;
    const interest = total - P;
    $('#emiAmountOut').textContent = rupees(P);
    $('#emiTenureOut').textContent = `${n} months`;
    $('#emiRateOut').textContent = `${rate}% p.a.`;
    $('#emiValue').textContent = rupees(emi);
    $('#emiPrincipal').textContent = rupees(P);
    $('#emiInterest').textContent = rupees(interest);
    $('#emiTotal').textContent = rupees(total);
    $('#splitPrincipal').style.flexBasis = `${(P / total) * 100}%`;
    $('#splitInterest').style.flexBasis = `${(interest / total) * 100}%`;
    [amountIn, tenureIn, rateIn].forEach(fill);
  }
  function setCalc(amount, months) {
    amountIn.value = amount;
    tenureIn.value = months;
    rateIn.value = RATE;
    calc();
  }
  [amountIn, tenureIn, rateIn].forEach((el) => el.addEventListener('input', calc));
  calc();
})();
