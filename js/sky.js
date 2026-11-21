/* ==========================================================================
   sky.js — 共用星空背景
   微弱闪烁的星点 + 少量十字星芒 + 偶发流星 + 鼠标视差
   用法：<canvas id="sky"></canvas> 后引入本文件即可自动启动
   ========================================================================== */

(function initSky() {
  const canvas = document.getElementById('sky');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let stars = [];
  let flares = [];
  let shooter = null;
  let nextShooterAt = 0;
  let rafId = null;

  /* 鼠标视差：整体轻微跟随，按深度分层位移 */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function build() {
    const count = Math.min(320, Math.round((W * H) / 6400));
    stars = Array.from({ length: count }, () => {
      const depth = Math.random();          // 0 远 → 1 近
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.5 + depth * 1.5,
        base: 0.18 + Math.random() * 0.55,  // 基础亮度
        amp: 0.12 + Math.random() * 0.35,   // 闪烁幅度
        speed: rand(0.25, 1.1),             // 闪烁速度
        phase: Math.random() * TAU,
        depth,
        hue: Math.random() < 0.14 ? 'warm' : 'cool'
      };
    });

    // 少量醒目的十字星芒
    flares = Array.from({ length: 9 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.85,
      len: rand(9, 20),
      base: rand(0.5, 0.9),
      amp: rand(0.15, 0.35),
      speed: rand(0.3, 0.8),
      phase: Math.random() * TAU,
      depth: rand(0.6, 1)
    }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (reduceMotion) drawStatic();
  }

  function colorOf(star, alpha) {
    return star.hue === 'warm'
      ? `rgba(255, 240, 208, ${alpha})`
      : `rgba(214, 231, 255, ${alpha})`;
  }

  function drawStar(s, alpha, ox, oy) {
    ctx.fillStyle = colorOf(s, alpha);
    ctx.beginPath();
    ctx.arc(s.x + ox, s.y + oy, s.r, 0, TAU);
    ctx.fill();

    if (s.r > 1.4) { // 较近的星点带一圈柔光
      const g = ctx.createRadialGradient(s.x + ox, s.y + oy, 0, s.x + ox, s.y + oy, s.r * 5);
      g.addColorStop(0, colorOf(s, alpha * 0.35));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x + ox, s.y + oy, s.r * 5, 0, TAU);
      ctx.fill();
    }
  }

  function drawSpike(len, width, alpha) {
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255, 248, 226, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 248, 226, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, width);
    ctx.closePath();
    ctx.fill();
  }

  function drawFlare(f, alpha, ox, oy) {
    const x = f.x + ox;
    const y = f.y + oy;

    const core = ctx.createRadialGradient(x, y, 0, x, y, f.len * 0.55);
    core.addColorStop(0, `rgba(255, 250, 232, ${alpha})`);
    core.addColorStop(0.4, `rgba(255, 240, 200, ${alpha * 0.3})`);
    core.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, f.len * 0.55, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      drawSpike(f.len, 0.9, alpha * (i % 2 === 0 ? 1 : 0.72));
    }
    ctx.restore();
  }

  function spawnShooter() {
    const fromLeft = Math.random() < 0.7;
    shooter = {
      x: fromLeft ? rand(-0.1, 0.35) * W : rand(0.7, 1.1) * W,
      y: rand(0.04, 0.4) * H,
      vx: (fromLeft ? 1 : -1) * rand(320, 520),
      vy: rand(120, 210),
      life: 0,
      ttl: rand(0.9, 1.5)
    };
  }

  function drawShooter(dt) {
    if (!shooter) return;
    shooter.life += dt;
    shooter.x += shooter.vx * dt;
    shooter.y += shooter.vy * dt;

    const k = shooter.life / shooter.ttl;
    if (k >= 1) { shooter = null; return; }

    const alpha = Math.sin(Math.PI * k) * 0.9;
    const tail = 130;
    const ang = Math.atan2(shooter.vy, shooter.vx);
    const tx = shooter.x - Math.cos(ang) * tail;
    const ty = shooter.y - Math.sin(ang) * tail;

    const g = ctx.createLinearGradient(shooter.x, shooter.y, tx, ty);
    g.addColorStop(0, `rgba(255, 250, 235, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 250, 235, 0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    stars.forEach(s => drawStar(s, s.base, 0, 0));
    flares.forEach(f => drawFlare(f, f.base, 0, 0));
  }

  let last = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;

    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    ctx.clearRect(0, 0, W, H);

    for (const s of stars) {
      const alpha = Math.max(0, s.base + s.amp * Math.sin(t * s.speed + s.phase));
      drawStar(s, alpha, pointer.x * s.depth * 16, pointer.y * s.depth * 12);
    }

    for (const f of flares) {
      const alpha = Math.max(0, f.base + f.amp * Math.sin(t * f.speed + f.phase));
      drawFlare(f, alpha, pointer.x * f.depth * 26, pointer.y * f.depth * 18);
    }

    if (t > nextShooterAt) {
      nextShooterAt = t + rand(7, 16);
      spawnShooter();
    }
    drawShooter(dt);
  }

  function start() {
    if (reduceMotion) { drawStatic(); return; }
    last = performance.now();
    nextShooterAt = last / 1000 + rand(4, 9);
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  window.addEventListener('resize', resize);

  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!reduceMotion) start();
  });

  resize();
  start();
})();
