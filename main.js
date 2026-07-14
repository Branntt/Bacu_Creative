(() => {
  "use strict";

  /* ---------- background particles (canvas2d, lightweight) ---------- */

  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let w, h, dpr;
  let particles = [];
  const POINTER = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = window.innerWidth * dpr;
    h = canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    const count = Math.min(46, Math.floor((window.innerWidth * window.innerHeight) / 26000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 1.6 + 0.4) * dpr,
      vy: (Math.random() * 0.08 + 0.02) * dpr,
      a: Math.random() * 0.5 + 0.15,
      drift: Math.random() * 0.4 - 0.2,
    }));
    updatePupilBounds();
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    POINTER.x += (POINTER.tx - POINTER.x) * 0.03;
    POINTER.y += (POINTER.ty - POINTER.y) * 0.03;
    const parX = (POINTER.x - 0.5) * 24 * dpr;
    const parY = (POINTER.y - 0.5) * 24 * dpr;

    for (const p of particles) {
      p.y -= p.vy;
      p.x += p.drift * 0.05;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      const gx = p.x + parX * (p.r / dpr);
      const gy = p.y + parY * (p.r / dpr);

      ctx.beginPath();
      ctx.arc(gx, gy, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(62, 140, 111, ${p.a})`;
      ctx.fill();
    }

    moveEyes();
    requestAnimationFrame(tick);
  }

  /* ---------- pupil tracking ---------- */

  const pupilConfigs = [
    { el: document.getElementById("pupilIntro"), maxX: 0, maxY: 0 },
    { el: document.getElementById("pupilMark"), maxX: 0, maxY: 0 },
  ];

  function updatePupilBounds() {
    for (const cfg of pupilConfigs) {
      if (!cfg.el) continue;
      const wrap = cfg.el.parentElement;
      const rect = wrap.getBoundingClientRect();
      cfg.maxX = rect.width * 0.045;
      cfg.maxY = rect.height * 0.05;
    }
  }

  function moveEyes() {
    const nx = (POINTER.x - 0.5) * 2;
    const ny = (POINTER.y - 0.5) * 2;
    for (const cfg of pupilConfigs) {
      if (!cfg.el) continue;
      const dx = nx * cfg.maxX;
      const dy = ny * cfg.maxY;
      cfg.el.style.transform = `translate(calc(-50% + ${dx.toFixed(2)}px), calc(-50% + ${dy.toFixed(2)}px))`;
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", (e) => {
    POINTER.tx = e.clientX / window.innerWidth;
    POINTER.ty = e.clientY / window.innerHeight;
  }, { passive: true });
  window.addEventListener("deviceorientation", (e) => {
    if (e.gamma == null || e.beta == null) return;
    POINTER.tx = Math.min(1, Math.max(0, 0.5 + e.gamma / 90));
    POINTER.ty = Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 90));
  }, { passive: true });

  resize();
  requestAnimationFrame(tick);

  /* ---------- subtle audio chime (synthesized, no asset needed) ---------- */

  let audioCtx = null;
  let audioUnlocked = false;

  function unlockAudio() {
    if (audioUnlocked) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioUnlocked = true;
    } catch (e) { /* audio unavailable, silently skip */ }
  }

  function playChime() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 1.1);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.045, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
  }

  window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });

  /* ---------- intro sequence ---------- */

  const intro = document.getElementById("intro");
  const content = document.getElementById("content");
  const eyeWrap = document.getElementById("eyeWrap");
  const markWrap = document.getElementById("markWrap");
  const introText = document.getElementById("introText");
  const cards = document.querySelectorAll(".card");

  const SEEN_KEY = "bacu_intro_seen";
  const skip = sessionStorage.getItem(SEEN_KEY) === "1";

  function revealContent() {
    intro.style.display = "none";
    content.removeAttribute("aria-hidden");
    gsap.set(content, { visibility: "visible" });
    gsap.to(content, { opacity: 1, duration: 0.5, ease: "power1.out" });
    gsap.fromTo(".hub-header", { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power2.out" });
    gsap.fromTo(cards, { y: 14, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.55, ease: "power2.out", stagger: 0.07, delay: 0.15,
    });
  }

  function runIntro() {
    const tl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: () => {
        gsap.to(intro, {
          opacity: 0, duration: 0.6, ease: "power1.inOut",
          onComplete: () => {
            revealContent();
            playChime();
            sessionStorage.setItem(SEEN_KEY, "1");
          },
        });
      },
    });

    tl.to(eyeWrap, { opacity: 1, scale: 1, duration: 1.1, ease: "power2.out" })
      .to(eyeWrap, { scaleY: 1.025, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: 1 }, "<0.2")
      // slow organic blink
      .to(eyeWrap, { scaleY: 0.08, duration: 0.16, ease: "power1.in" }, "+=0.5")
      .to(eyeWrap, { scaleY: 1, duration: 0.28, ease: "power2.out" })
      .to(introText, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, "-=0.1")
      .to({}, { duration: 0.9 }); // hold before dismiss
  }

  function skipIntro() {
    gsap.killTweensOf([eyeWrap, introText, intro]);
    intro.style.display = "none";
    revealContent();
  }

  /* ---------- idle blink loop for the persistent header eye ---------- */

  function blink(target) {
    gsap.to(target, {
      scaleY: 0.08,
      duration: 0.09,
      ease: "power1.in",
      onComplete: () => {
        gsap.to(target, { scaleY: 1, duration: 0.16, ease: "power2.out" });
      },
    });
  }

  function scheduleBlink(target) {
    const delay = 2600 + Math.random() * 3800;
    setTimeout(() => {
      blink(target);
      // occasionally do a quick double-blink for a wink-like feel
      if (Math.random() < 0.25) {
        setTimeout(() => blink(target), 320);
      }
      scheduleBlink(target);
    }, delay);
  }

  if (markWrap) scheduleBlink(markWrap);

  intro.addEventListener("click", () => {
    if (intro.style.display === "none") return;
    unlockAudio();
    skipIntro();
    sessionStorage.setItem(SEEN_KEY, "1");
  }, { passive: true });

  if (skip || !window.gsap) {
    intro.style.display = "none";
    revealContent();
  } else {
    runIntro();
  }

  /* ---------- card pointer highlight ---------- */

  cards.forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--px", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      card.style.setProperty("--py", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    });
  });
})();
