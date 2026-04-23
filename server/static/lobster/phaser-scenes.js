/**
 * phaser-scenes.js — 将原 Phaser 三大场景嵌入 liuyue 的场景背景层
 * 每个场景一个独立 Phaser Game 实例，挂载到对应 <div> 容器
 */
;(function () {
  'use strict';

  // ===== 通用云朵工具 =====
  function createDriftingClouds(scene, w, h, configs) {
    const baseScale = w / 1200;
    configs.forEach((cfg) => {
      const cy = h * cfg.yPct;
      const cloud = scene.add.image(w * cfg.initPct, cy, cfg.key)
        .setScale(cfg.scl * baseScale)
        .setAlpha(cfg.alpha)
        .setDepth(cfg.depth || 3);

      const margin = (cloud.width * cfg.scl * baseScale) / 2 + 30;
      const leftEdge = -margin;
      const rightEdge = w + margin;
      const exitX = cfg.dir > 0 ? rightEdge : leftEdge;
      const enterX = cfg.dir > 0 ? leftEdge : rightEdge;
      const fullDist = Math.abs(rightEdge - leftEdge);
      const firstDist = Math.abs(exitX - cloud.x);
      const firstDuration = (firstDist / fullDist) * cfg.speed;

      scene.tweens.add({
        targets: cloud, x: exitX, duration: firstDuration, ease: 'Linear',
        onComplete: () => driftLoop(scene, cloud, enterX, exitX, cfg.speed)
      });
      scene.tweens.add({
        targets: cloud, y: cy - 8 - Math.random() * 6,
        duration: 6000 + Math.random() * 4000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
      });
    });
  }

  function driftLoop(scene, cloud, enterX, exitX, duration) {
    cloud.x = enterX;
    scene.tweens.add({
      targets: cloud, x: exitX, duration: duration, ease: 'Linear',
      onComplete: () => driftLoop(scene, cloud, enterX, exitX, duration)
    });
  }

  // ==========================================================
  //  池塘场景
  // ==========================================================
  class PondScene extends Phaser.Scene {
    constructor() { super({ key: 'PondScene' }); }

    preload() {
      this.load.image('pond_bg', 'assets/chitang3.jpg');
      this.load.spritesheet('lobster', 'assets/sprites/lobster.webp', { frameWidth: 240, frameHeight: 240, endFrame: 60 });
      this.load.spritesheet('clover', 'assets/sprites/clover.webp', { frameWidth: 480, frameHeight: 268, endFrame: 45 });
      this.load.image('cloud1', 'assets/yunduo/yunduo1.png');
      this.load.image('cloud2', 'assets/yunduo/yunduo2.png');
      this.load.image('cloud3', 'assets/yunduo/yunduo3.png');
      this.load.image('cloud4', 'assets/yunduo/yunduo4.png');
      // 池塘装饰元素
      this.load.image('house', 'assets/house.png');
      this.load.image('piaoliuping1', 'assets/piaoliuping1.png');
      this.load.image('piaoliuping2', 'assets/piaoliuping2.png');
      this.load.image('piaoliuping3', 'assets/piaoliuping3.png');
    }

    create() {
      const w = this.scale.width, h = this.scale.height;

      // 背景
      const bg = this.add.image(w / 2, h / 2, 'pond_bg');
      bg.setScale(Math.max(w / bg.width, h / bg.height)).setDepth(0);

      // 云朵
      createDriftingClouds(this, w, h, [
        { key: 'cloud1', initPct: 0.15, yPct: 0.04, scl: 0.50, alpha: 0.90, speed: 150000, dir: 1 },
        { key: 'cloud2', initPct: 0.70, yPct: 0.08, scl: 0.38, alpha: 0.80, speed: 110000, dir: -1 },
        { key: 'cloud3', initPct: 0.40, yPct: 0.02, scl: 0.44, alpha: 0.85, speed: 130000, dir: 1 },
        { key: 'cloud4', initPct: 0.85, yPct: 0.12, scl: 0.30, alpha: 0.75, speed: 90000, dir: -1 },
      ]);

      // 池塘装饰元素（位置参考 chitang4.jpg）
      this.createDecorations(w, h);

      // 水面波纹
      this.createRipples(w, h);
    }

    createDecorations(w, h) {
      const baseScale = w / 2741; // 基于原图 2741px 宽度的缩放比

      // ── 树屋 house.png → 成长档案入口 ──
      const house = this.add.image(w * 0.20, h * 0.40, 'house')
        .setScale(baseScale * 0.85)
        .setOrigin(0.5, 1)
        .setDepth(2);

      // hover 放大（底部中心）
      const hsTreehouse = document.getElementById('hs-treehouse');
      if (hsTreehouse) {
        hsTreehouse.addEventListener('mouseenter', () => {
          this.tweens.add({
            targets: [house], scaleX: baseScale * 1.0, scaleY: baseScale * 1.0,
            duration: 250, ease: 'Back.easeOut',
          });
        });
        hsTreehouse.addEventListener('mouseleave', () => {
          this.tweens.add({
            targets: [house], scaleX: baseScale * 0.85, scaleY: baseScale * 0.85,
            duration: 300, ease: 'Sine.easeOut',
          });
        });
      }

      // ── 漂流瓶：底部中心锚点 + 晃动动画 ──
      const bottleConfigs = [
        { key: 'piaoliuping1', x: 0.34, y: 0.84, scale: 0.75, hsId: 'hs-health',
          swingAngle: 6, swingDur: 2400 },
        { key: 'piaoliuping2', x: 0.49, y: 0.68, scale: 0.70, hsId: 'hs-birth',
          swingAngle: 5, swingDur: 2800 },
        { key: 'piaoliuping3', x: 0.57, y: 0.70, scale: 0.70, hsId: 'hs-diary',
          swingAngle: 7, swingDur: 2200 },
      ];

      bottleConfigs.forEach((cfg, i) => {
        const bx = w * cfg.x, by = h * cfg.y;
        const bottle = this.add.image(bx, by, cfg.key)
          .setScale(baseScale * cfg.scale)
          .setOrigin(0.5, 1)
          .setDepth(4);

        // 晃动动画
        this.tweens.add({
          targets: bottle,
          angle: { from: -cfg.swingAngle, to: cfg.swingAngle },
          duration: cfg.swingDur,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
          delay: i * 400,
        });

        // hover 放大
        const hsEl = document.getElementById(cfg.hsId);
        if (hsEl) {
          hsEl.addEventListener('mouseenter', () => {
            this.tweens.add({
              targets: [bottle], scaleX: baseScale * cfg.scale * 1.15, scaleY: baseScale * cfg.scale * 1.15,
              duration: 200, ease: 'Back.easeOut',
            });
          });
          hsEl.addEventListener('mouseleave', () => {
            this.tweens.add({
              targets: [bottle], scaleX: baseScale * cfg.scale, scaleY: baseScale * cfg.scale,
              duration: 250, ease: 'Sine.easeOut',
            });
          });
        }
      });
    }

    createRipples(w, h) {
      [
        { xPct: 0.475, yPct: 0.79, rx: 35, ry: 16, delay: 0 },
        { xPct: 0.46, yPct: 0.80, rx: 50, ry: 22, delay: 1000 },
        { xPct: 0.49, yPct: 0.795, rx: 25, ry: 12, delay: 2000 },
      ].forEach(cfg => {
        const rc = { x: w * cfg.xPct, y: h * cfg.yPct, rx: cfg.rx, ry: cfg.ry };
        this.time.delayedCall(cfg.delay, () => this.spawnRipple(rc));
      });
    }

    spawnRipple(cfg) {
      const g = this.add.graphics().setDepth(5);
      g.lineStyle(1.5, 0xffffff, 0.3);
      g.strokeEllipse(cfg.x, cfg.y, cfg.rx * 2, cfg.ry * 2);
      this.tweens.add({
        targets: g, scaleX: 2.5, scaleY: 2.5, alpha: { from: 0.6, to: 0 },
        duration: 3000, ease: 'Quad.easeOut', onComplete: () => g.destroy(),
      });
      this.time.delayedCall(3000, () => this.spawnRipple(cfg));
    }

    createLobster(w, h) {
      if (!this.anims.exists('lobster-idle')) {
        this.anims.create({
          key: 'lobster-idle',
          frames: this.anims.generateFrameNumbers('lobster', { start: 0, end: 60 }),
          frameRate: 15, repeat: -1,
        });
      }
      const s = (w / 750) * 0.5;
      const lx = w * 0.475, ly = h * 0.855;
      const lobster = this.add.sprite(lx, ly, 'lobster').setScale(s).setDepth(10).play('lobster-idle');
      const floatAmt = Math.max(3, h * 0.004);
      this.tweens.add({ targets: lobster, y: ly - floatAmt, duration: 1500, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
      this.tweens.add({ targets: lobster, angle: { from: -0.5, to: 0.5 }, duration: 3000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    }

    createClover(w, h) {
      if (!this.anims.exists('clover-idle')) {
        this.anims.create({
          key: 'clover-idle',
          frames: this.anims.generateFrameNumbers('clover', { start: 0, end: 45 }),
          frameRate: 12, repeat: -1,
        });
      }
      const s = (w / 750) * 0.65;
      const clover = this.add.sprite(w * 0.18, h * 0.92, 'clover').setScale(s).setDepth(10).play('clover-idle');
      this.tweens.add({ targets: clover, angle: { from: -0.8, to: 0.8 }, duration: 4000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    }
  }

  // ==========================================================
  //  森林场景
  // ==========================================================
  class ForestScene extends Phaser.Scene {
    constructor() { super({ key: 'ForestScene' }); }

    preload() {
      this.load.image('forest_bg', 'assets/forest_bg.png');
      this.load.image('forest_fg', 'assets/forest.png');
      this.load.spritesheet('forest_lobster', 'assets/sprites/forest_lobster.webp', { frameWidth: 320, frameHeight: 266, endFrame: 45 });
      this.load.image('feibiao', 'assets/feibiao.png');
      this.load.image('cloud1', 'assets/yunduo/yunduo1.png');
      this.load.image('cloud2', 'assets/yunduo/yunduo2.png');
      this.load.image('cloud3', 'assets/yunduo/yunduo3.png');
      this.load.image('cloud4', 'assets/yunduo/yunduo4.png');
    }

    create() {
      const w = this.scale.width, h = this.scale.height;

      // 背景
      const bg = this.add.image(w / 2, h / 2, 'forest_bg');
      bg.setScale(Math.max(w / bg.width, h / bg.height)).setDepth(0);

      // 云朵
      createDriftingClouds(this, w, h, [
        { key: 'cloud1', initPct: 0.10, yPct: 0.10, scl: 0.45, alpha: 0.85, speed: 140000, dir: 1, depth: 2 },
        { key: 'cloud3', initPct: 0.55, yPct: 0.07, scl: 0.40, alpha: 0.80, speed: 120000, dir: -1, depth: 2 },
        { key: 'cloud2', initPct: 0.80, yPct: 0.13, scl: 0.35, alpha: 0.75, speed: 100000, dir: 1, depth: 2 },
        { key: 'cloud4', initPct: 0.35, yPct: 0.16, scl: 0.32, alpha: 0.70, speed: 95000, dir: -1, depth: 2 },
      ]);

      // 前景
      const fg = this.add.image(w / 2, h / 2, 'forest_fg');
      fg.setScale(Math.max(w / fg.width, h / fg.height)).setDepth(5).setOrigin(0.5, 0.5);
    }

    createForestLobster(w, h) {
      if (!this.anims.exists('forest-lobster-idle')) {
        this.anims.create({
          key: 'forest-lobster-idle',
          frames: this.anims.generateFrameNumbers('forest_lobster', { start: 0, end: 45 }),
          frameRate: 12, repeat: -1,
        });
      }
      const s = (w / 1000) * 1.1;
      const lx = w * 0.72, ly = h * 0.70;
      const lobster = this.add.sprite(lx, ly, 'forest_lobster').setScale(s).setDepth(8).play('forest-lobster-idle');

      // 飞镖：第 32 帧发射
      lobster.on('animationupdate', (anim, frame) => {
        if (frame.index === 32) this.launchShuriken(w, h, lobster.x, lobster.y);
      });
    }

    launchShuriken(w, h, startX, startY) {
      const feibiaoScale = (w / 1000) * 0.28;
      const targetX = w * 0.16, targetY = h * 0.47;
      const fb = this.add.image(startX - w * 0.04, startY, 'feibiao').setScale(0).setAlpha(1).setDepth(12);
      this.tweens.add({ targets: fb, angle: 360 * 4, duration: 800, ease: 'Linear' });
      this.tweens.add({
        targets: fb, x: targetX, y: targetY, duration: 800, ease: 'Power2',
        onUpdate: (tween) => {
          const p = tween.progress;
          fb.setScale(p <= 0.10 ? feibiaoScale * (p / 0.10) : feibiaoScale);
          if (p >= 0.85) fb.setAlpha(0);
          else if (p >= 0.70) fb.setAlpha(1 - (p - 0.70) / 0.15);
          else fb.setAlpha(1);
        },
        onComplete: () => fb.destroy(),
      });
    }
  }

  // ==========================================================
  //  菜田场景
  // ==========================================================
  class FarmScene extends Phaser.Scene {
    constructor() { super({ key: 'FarmScene' }); }

    preload() {
      this.load.image('farm_bg', 'assets/caitian.jpg');
      this.load.spritesheet('fengche', 'assets/sprites/fengche.webp', { frameWidth: 300, frameHeight: 304, endFrame: 37 });
      this.load.spritesheet('chudixia', 'assets/sprites/chudixia.webp', { frameWidth: 320, frameHeight: 302, endFrame: 45 });
      this.load.spritesheet('zhaicaixia', 'assets/sprites/zhaicaixia.webp', { frameWidth: 320, frameHeight: 298, endFrame: 45 });
      this.load.image('cloud1', 'assets/yunduo/yunduo1.png');
      this.load.image('cloud2', 'assets/yunduo/yunduo2.png');
      this.load.image('cloud3', 'assets/yunduo/yunduo3.png');
      this.load.image('cloud4', 'assets/yunduo/yunduo4.png');
    }

    create() {
      const w = this.scale.width, h = this.scale.height;

      // 背景
      const bg = this.add.image(w / 2, h / 2, 'farm_bg');
      bg.setScale(Math.max(w / bg.width, h / bg.height)).setDepth(0);

      // 云朵
      createDriftingClouds(this, w, h, [
        { key: 'cloud1', initPct: 0.08, yPct: 0.06, scl: 0.48, alpha: 0.85, speed: 140000, dir: 1, depth: 2 },
        { key: 'cloud2', initPct: 0.35, yPct: 0.03, scl: 0.42, alpha: 0.80, speed: 120000, dir: -1, depth: 2 },
        { key: 'cloud3', initPct: 0.60, yPct: 0.09, scl: 0.38, alpha: 0.75, speed: 110000, dir: 1, depth: 2 },
        { key: 'cloud4', initPct: 0.82, yPct: 0.05, scl: 0.44, alpha: 0.82, speed: 130000, dir: -1, depth: 2 },
        { key: 'cloud1', initPct: 0.20, yPct: 0.12, scl: 0.30, alpha: 0.70, speed: 95000, dir: 1, depth: 2 },
      ]);

      // 风车
      this.createWindmill(w, h);
    }

    createWindmill(w, h) {
      if (!this.anims.exists('fengche-idle')) {
        this.anims.create({
          key: 'fengche-idle',
          frames: this.anims.generateFrameNumbers('fengche', { start: 0, end: 37 }),
          frameRate: 12, repeat: -1,
        });
      }
      this.add.sprite(w * 0.75, h * 0.365, 'fengche').setScale((w / 1000) * 0.65).setDepth(5).play('fengche-idle');
    }

    createShrimpLoop(w, h) {
      if (!this.anims.exists('chudixia-once')) {
        this.anims.create({ key: 'chudixia-once', frames: this.anims.generateFrameNumbers('chudixia', { start: 0, end: 45 }), frameRate: 12, repeat: 0 });
      }
      if (!this.anims.exists('zhaicaixia-once')) {
        this.anims.create({ key: 'zhaicaixia-once', frames: this.anims.generateFrameNumbers('zhaicaixia', { start: 0, end: 45 }), frameRate: 12, repeat: 0 });
      }

      const s = (w / 1000) * 0.55;
      const digShrimp = this.add.sprite(w * 0.4512, h * 0.67, 'chudixia').setScale(s).setDepth(8).setVisible(false).setAlpha(0);
      const pickShrimp = this.add.sprite(w * 0.2906, h * 0.80, 'zhaicaixia').setScale(s).setDepth(8).setVisible(false).setAlpha(0);
      const scene = this;

      function fadeIn(sprite, cb) {
        sprite.setVisible(true).setAlpha(0);
        scene.tweens.add({ targets: sprite, alpha: 1, duration: 300, ease: 'Sine.easeIn', onComplete: cb });
      }
      function fadeOut(sprite, cb) {
        scene.tweens.add({ targets: sprite, alpha: 0, duration: 300, ease: 'Sine.easeOut', onComplete: () => { sprite.setVisible(false); if (cb) cb(); } });
      }
      function playDig() {
        fadeIn(digShrimp, () => {
          digShrimp.play('chudixia-once');
          digShrimp.once('animationcomplete', () => fadeOut(digShrimp, () => scene.time.delayedCall(200, playPick)));
        });
      }
      function playPick() {
        fadeIn(pickShrimp, () => {
          pickShrimp.play('zhaicaixia-once');
          pickShrimp.once('animationcomplete', () => fadeOut(pickShrimp, () => scene.time.delayedCall(200, playDig)));
        });
      }
      playDig();
    }
  }

  // ==========================================================
  //  按需创建 Phaser 实例（懒加载 + 暂停/恢复）
  // ==========================================================

  // 场景映射表
  const SCENE_MAP = {
    pond:   { parentId: 'phaser-pond',   SceneClass: PondScene },
    forest: { parentId: 'phaser-forest', SceneClass: ForestScene },
    farm:   { parentId: 'phaser-farm',   SceneClass: FarmScene },
  };

  // 存储已创建的 Phaser 实例
  const phaserInstances = {};

  function createPhaserInstance(parentId, SceneClass) {
    const parent = document.getElementById(parentId);
    if (!parent) return null;
    const rect = parent.getBoundingClientRect();
    return new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent,
      backgroundColor: 'transparent',
      transparent: true,
      input: { mouse: false, touch: false, keyboard: false },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: rect.width || window.innerWidth,
        height: rect.height || window.innerHeight,
      },
      render: { antialias: true, pixelArt: false, roundPixels: false, transparent: true, resolution: window.devicePixelRatio || 1 },
      scene: [SceneClass],
      banner: false,
      fps: { target: 30, forceSetTimeOut: false }, // 限制到 30fps 足够流畅且省资源
    });
  }

  /**
   * 确保指定场景的 Phaser 实例存在并恢复运行
   * @param {string} sceneName - 'pond' | 'forest' | 'farm'
   */
  function ensurePhaserScene(sceneName) {
    const cfg = SCENE_MAP[sceneName];
    if (!cfg) return;

    if (!phaserInstances[sceneName]) {
      // 首次创建
      const game = createPhaserInstance(cfg.parentId, cfg.SceneClass);
      if (game) {
        phaserInstances[sceneName] = game;
        console.log('[Phaser] 创建实例:', sceneName);
      }
    } else {
      // 已存在 → 恢复运行
      const game = phaserInstances[sceneName];
      if (game.loop && game.loop.sleeping) {
        game.loop.wake();
        console.log('[Phaser] 恢复实例:', sceneName);
      }
    }
  }

  /**
   * 暂停指定场景的 Phaser 实例（停止渲染循环，释放 CPU/GPU）
   * @param {string} sceneName - 'pond' | 'forest' | 'farm'
   */
  function pausePhaserScene(sceneName) {
    const game = phaserInstances[sceneName];
    if (game && game.loop && !game.loop.sleeping) {
      game.loop.sleep();
      console.log('[Phaser] 暂停实例:', sceneName);
    }
  }

  /**
   * 切换到指定场景，暂停其他场景
   * @param {string} activeScene - 'pond' | 'forest' | 'farm'
   */
  window._phaserSwitchScene = function (activeScene) {
    // 激活目标场景
    ensurePhaserScene(activeScene);
    // 暂停所有非活跃场景
    Object.keys(SCENE_MAP).forEach(function (name) {
      if (name !== activeScene) pausePhaserScene(name);
    });
  };

  // 暴露引用供外部访问
  window._phaserInstances = phaserInstances;

  // 等 DOM 就绪后仅初始化池塘（默认场景）
  function init() {
    ensurePhaserScene('pond');
    // 森林和菜田在切换到时才创建，节省初始资源
    console.log('[Phaser] 懒加载模式：仅初始化池塘，其余按需创建');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
