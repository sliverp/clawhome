/**
 * sprite-animator.js — 纯 JS + Canvas 2D 序列帧龙虾渲染器
 * 位置和动效参数与原 Phaser 场景完全一致
 */
;(function () {
  'use strict';

  // ─── 通用 spritesheet 播放器 ───
  class SpriteAnimator {
    constructor(canvas, src, fw, fh, totalFrames, fps) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fw = fw;
      this.fh = fh;
      this.totalFrames = totalFrames;
      this.fps = fps;
      this.frame = 0;
      this.img = new Image();
      this.img.src = src;
      this.ready = false;
      this.cols = 0;
      this._raf = null;
      this._lastTime = 0;
      this._interval = 1000 / fps;
      this._onFrame = null; // 回调：每帧触发
      this._paused = false; // 暂停状态

      canvas.width = fw;
      canvas.height = fh;

      this.img.onload = () => {
        this.cols = Math.round(this.img.width / fw);
        this.ready = true;
        this._lastTime = performance.now();
        this._tick();
      };
    }

    _tick() {
      this._raf = requestAnimationFrame((t) => this._loop(t));
    }

    _loop(now) {
      if (!this.ready || this._paused) return;
      const delta = now - this._lastTime;
      if (delta >= this._interval) {
        this._lastTime = now - (delta % this._interval);
        this._draw();
        this.frame = (this.frame + 1) % this.totalFrames;
        if (this._onFrame) this._onFrame(this.frame);
      }
      this._tick();
    }

    _draw() {
      const col = this.frame % this.cols;
      const row = Math.floor(this.frame / this.cols);
      this.ctx.clearRect(0, 0, this.fw, this.fh);
      this.ctx.drawImage(this.img, col * this.fw, row * this.fh, this.fw, this.fh, 0, 0, this.fw, this.fh);
    }

    pause() {
      this._paused = true;
      if (this._raf) cancelAnimationFrame(this._raf);
    }

    resume() {
      if (!this._paused) return;
      this._paused = false;
      if (this.ready) {
        this._lastTime = performance.now();
        this._tick();
      }
    }

    destroy() {
      if (this._raf) cancelAnimationFrame(this._raf);
    }
  }

  // ─── 单次播放器（播完回调，用于菜田交替） ───
  class SpriteOnceAnimator {
    constructor(canvas, src, fw, fh, totalFrames, fps) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fw = fw;
      this.fh = fh;
      this.totalFrames = totalFrames;
      this.fps = fps;
      this.frame = 0;
      this.img = new Image();
      this.img.src = src;
      this.ready = false;
      this.cols = 0;
      this._raf = null;
      this._lastTime = 0;
      this._interval = 1000 / fps;
      this._playing = false;
      this._onComplete = null;

      canvas.width = fw;
      canvas.height = fh;

      this.img.onload = () => {
        this.cols = Math.round(this.img.width / fw);
        this.ready = true;
      };
    }

    play(onComplete) {
      this.frame = 0;
      this._playing = true;
      this._onComplete = onComplete;
      this._lastTime = performance.now();
      this._tick();
    }

    _tick() {
      if (!this._playing) return;
      this._raf = requestAnimationFrame((t) => this._loop(t));
    }

    _loop(now) {
      if (!this.ready || !this._playing) return;
      const delta = now - this._lastTime;
      if (delta >= this._interval) {
        this._lastTime = now - (delta % this._interval);
        this._draw();
        this.frame++;
        if (this.frame >= this.totalFrames) {
          this._playing = false;
          if (this._onComplete) this._onComplete();
          return;
        }
      }
      this._tick();
    }

    _draw() {
      const col = this.frame % this.cols;
      const row = Math.floor(this.frame / this.cols);
      this.ctx.clearRect(0, 0, this.fw, this.fh);
      this.ctx.drawImage(this.img, col * this.fw, row * this.fh, this.fw, this.fh, 0, 0, this.fw, this.fh);
    }

    stop() {
      this._playing = false;
      if (this._raf) cancelAnimationFrame(this._raf);
    }
  }

  // ─── JS 浮动动效（模拟 Phaser tween，支持暂停/恢复） ───
  function applyFloat(el, amplitude, duration) {
    let start = null;
    let paused = false;
    let rafId = null;
    function tick(ts) {
      if (paused) return;
      if (!start) start = ts;
      const progress = ((ts - start) % duration) / duration;
      const y = -amplitude * Math.sin(progress * Math.PI * 2);
      el.style.setProperty('--float-y', y + 'px');
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return {
      pause: function () { paused = true; if (rafId) cancelAnimationFrame(rafId); },
      resume: function () { if (!paused) return; paused = false; start = null; rafId = requestAnimationFrame(tick); },
    };
  }

  function applyRock(el, maxAngle, duration) {
    let start = null;
    let paused = false;
    let rafId = null;
    function tick(ts) {
      if (paused) return;
      if (!start) start = ts;
      const progress = ((ts - start) % duration) / duration;
      const angle = maxAngle * Math.sin(progress * Math.PI * 2);
      el.style.setProperty('--rock-angle', angle + 'deg');
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return {
      pause: function () { paused = true; if (rafId) cancelAnimationFrame(rafId); },
      resume: function () { if (!paused) return; paused = false; start = null; rafId = requestAnimationFrame(tick); },
    };
  }

  // ─── 初始化 ───
  // 存储所有动画句柄，方便按场景暂停/恢复
  const sceneAnimations = { pond: [], forest: [], farm: [] };

  function init() {
    // ===== 池塘龙虾 =====
    const pondCanvas = document.getElementById('pond-lobster-canvas');
    if (pondCanvas) {
      const pondAnim = new SpriteAnimator(pondCanvas, 'assets/sprites/lobster.webp', 240, 240, 61, 15);
      sceneAnimations.pond.push(pondAnim);
      const wrap = pondCanvas.closest('.pond-character');
      if (wrap) {
        const floatCtrl = applyFloat(wrap, Math.max(3, window.innerHeight * 0.004), 1500);
        const rockCtrl = applyRock(wrap, 0.5, 3000);
        sceneAnimations.pond.push(floatCtrl, rockCtrl);
      }
    }

    // ===== 森林龙虾（循环播放序列帧动画 + 飞镖） =====
    const forestCanvas = document.getElementById('forest-lobster-canvas');
    if (forestCanvas) {
      const forestAnim = new SpriteAnimator(forestCanvas, 'assets/sprites/forest_lobster.webp', 320, 266, 46, 12);
      forestAnim._onFrame = function (frameIdx) {
        if (frameIdx === 32) launchFeibiaoHTML();
      };
      window._forestLobsterAnim = forestAnim;
      sceneAnimations.forest.push(forestAnim);
      // 森林初始暂停（不是默认场景）
      forestAnim.pause();
    }

    // ===== 菜田龙虾（锄地虾 ↔ 摘菜虾交替） =====
    const farmDigCanvas = document.getElementById('farm-dig-canvas');
    const farmPickCanvas = document.getElementById('farm-pick-canvas');
    if (farmDigCanvas && farmPickCanvas) {
      const digAnim = new SpriteOnceAnimator(farmDigCanvas, 'assets/sprites/chudixia.webp', 320, 302, 46, 12);
      const pickAnim = new SpriteOnceAnimator(farmPickCanvas, 'assets/sprites/zhaicaixia.webp', 320, 298, 46, 12);

      const digWrap = farmDigCanvas.closest('.farm-shrimp-dig');
      const pickWrap = farmPickCanvas.closest('.farm-shrimp-pick');

      let farmLoopActive = false;

      function fadeIn(el, cb) {
        el.style.display = 'block';
        el.style.opacity = '0';
        requestAnimationFrame(() => {
          el.style.transition = 'opacity 300ms ease-in';
          el.style.opacity = '1';
          setTimeout(cb, 300);
        });
      }
      function fadeOut(el, cb) {
        el.style.transition = 'opacity 300ms ease-out';
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; if (cb) cb(); }, 300);
      }

      function playDig() {
        if (!farmLoopActive) return;
        fadeIn(digWrap, () => {
          if (!farmLoopActive) return;
          digAnim.play(() => {
            fadeOut(digWrap, () => { if (farmLoopActive) setTimeout(playPick, 200); });
          });
        });
      }
      function playPick() {
        if (!farmLoopActive) return;
        fadeIn(pickWrap, () => {
          if (!farmLoopActive) setTimeout(function () { pickAnim.play(() => {
            fadeOut(pickWrap, () => { if (farmLoopActive) setTimeout(playDig, 200); });
          }); }, 0);
        });
      }

      // 菜田动画控制对象
      const farmCtrl = {
        pause: function () {
          farmLoopActive = false;
          digAnim.stop();
          pickAnim.stop();
        },
        resume: function () {
          if (farmLoopActive) return;
          farmLoopActive = true;
          playDig();
        },
      };

      sceneAnimations.farm.push(farmCtrl);

      // 菜田默认暂停
      digAnim.img.onload = function () {
        digAnim.cols = Math.round(digAnim.img.width / digAnim.fw);
        digAnim.ready = true;
        // 不自动启动，等切到菜田时再启动
      };
    }

    // 暴露全局场景动画切换接口（传入 null 暂停全部）
    window._spriteAnimSwitchScene = function (activeScene) {
      Object.keys(sceneAnimations).forEach(function (scene) {
        var anims = sceneAnimations[scene];
        anims.forEach(function (a) {
          if (activeScene && scene === activeScene) {
            if (a.resume) a.resume();
          } else {
            if (a.pause) a.pause();
          }
        });
      });
      console.log('[SpriteAnim] 场景切换:', activeScene);
    };

    console.log('[SpriteAnim] 初始化完成，支持场景级暂停/恢复');
  }

  // ─── HTML 飞镖效果 ───
  function launchFeibiaoHTML() {
    const container = document.querySelector('.scene[data-scene="forest"]');
    if (!container) return;
    const w = container.offsetWidth, h = container.offsetHeight;
    // 森林龙虾位置：72%, 70%
    const startX = w * 0.72 - w * 0.04;
    const startY = h * 0.70;
    const targetX = w * 0.16;
    const targetY = h * 0.47;

    const fb = document.createElement('img');
    fb.src = 'assets/feibiao.png';
    fb.style.cssText = 'position:absolute;z-index:12;pointer-events:none;width:0;height:0;opacity:1;transform-origin:center;';
    fb.style.left = startX + 'px';
    fb.style.top = startY + 'px';
    container.appendChild(fb);

    const feibiaoSize = (w / 1000) * 0.28 * 80; // 约像素大小
    const duration = 800;
    const startTime = performance.now();

    function animate(now) {
      const p = Math.min(1, (now - startTime) / duration);
      // 位置（Power2 ease）
      const ep = 1 - Math.pow(1 - p, 2);
      const cx = startX + (targetX - startX) * ep;
      const cy = startY + (targetY - startY) * ep;
      // 旋转
      const angle = p * 360 * 4;
      // 缩放
      let scale = p <= 0.10 ? (p / 0.10) : 1;
      const sz = feibiaoSize * scale;
      // 透明度
      let alpha = 1;
      if (p >= 0.85) alpha = 0;
      else if (p >= 0.70) alpha = 1 - (p - 0.70) / 0.15;

      fb.style.left = (cx - sz / 2) + 'px';
      fb.style.top = (cy - sz / 2) + 'px';
      fb.style.width = sz + 'px';
      fb.style.height = sz + 'px';
      fb.style.transform = 'rotate(' + angle + 'deg)';
      fb.style.opacity = alpha;

      if (p < 1) {
        requestAnimationFrame(animate);
      } else {
        fb.remove();
      }
    }
    requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
