// Arranque de VÉRTICE: renderizador, bucle con límite de FPS y resolución dinámica,
// flujo MENÚ → MODO → EQUIPAMIENTO → CARGA → PARTIDA → RESULTADOS → JUGAR DE NUEVO.
import * as THREE from 'three';
import { Profile } from './profile.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Menus } from './menus.js';
import { MenuScene } from './menuscene.js';
import { Game } from './game.js';
import { QUALITY } from './data.js';
import { nextFrame } from './util.js';

class App {
  constructor() {
    Profile.load();
    this.canvas = document.getElementById('gl');
    this.hudRoot = document.getElementById('hud');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderScale = 1;
    this.input = new Input(document.getElementById('touch'), Profile.s);
    this.input.enabled = false;
    this.menuScene = new MenuScene(this);
    this.menus = new Menus(this);
    this.game = null; this.menuActive = true;
    this.last = performance.now(); this.lastDraw = 0;
    this.frameTimes = []; this.dynT = 0;
    this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.game && this.game.started && !this.game.over) this.game.pause(); });
    this.canvas.addEventListener('click', () => { if (this.game && this.game.started && !this.game.paused) this.lockPointer(); });
    this.menus.show('title', { progress: 0, ready: false });
    this.assetsReady = false;
    this.bootAssets();
    requestAnimationFrame((t) => this.loop(t));
    window.__vertice = this;
  }
  async bootAssets() {
    // El audio se genera con OfflineAudioContext (no necesita gesto del usuario)
    await Audio.generate((p) => this.menus.setTitleProgress(p * 0.95, false));
    this.menuScene.setOperator(Profile.data.look, Profile.data.loadout.primary, Profile.data.loadout.camo);
    this.assetsReady = true;
    this.menus.setTitleProgress(1, true);
    Audio.generateMusic();
  }
  onStartTap() {
    Audio.init(); Audio.resume(); Audio.applyVolumes();
    Audio.playMusic();
    Audio.ui2d('ui_confirm', 0.6);
    this.enterFullscreen();
    this.menus.show('main');
  }
  enterFullscreen() {
    if (!this.input.touchMode) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
      if (p && p.then) p.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
    } catch (e) { /* no soportado */ }
  }
  lockPointer() { if (!this.input.touchMode) this.input.requestLock(this.canvas); }

  get Q() { return QUALITY[Profile.s.quality] || QUALITY.medium; }
  applySettings() {
    const S = Profile.s;
    Audio.setVolumes({ master: S.master, music: S.music, sfx: S.sfx });
    this.input.settings = S;
    this.input.setTouchMode(this.input.detectTouch());
    document.documentElement.style.setProperty('--hud', S.hudScale || 1);
    this.renderScale = Math.min(this.renderScale, 1);
    this.renderer.shadowMap.type = S.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const Q = this.Q;
    const dpr = Math.min(window.devicePixelRatio || 1, Q.maxDpr) * Q.pixelRatio * (Profile.s.dynRes ? this.renderScale : 1);
    this.renderer.setPixelRatio(Math.max(0.4, dpr));
    this.renderer.setSize(w, h, false);
    this.aspect = w / h; this.pixelHeight = h * this.renderer.getPixelRatio();
    this.menuScene.resize();
    if (this.game && this.game.camera) this.game.onResize();
  }

  async startMatch() {
    const P = Profile.data;
    Profile.validate();
    const cfg = { ...P.match, loadout: { ...P.loadout }, look: { ...P.look } };
    if (cfg.mode === 'ffa') cfg.teamSize = 1;
    if (this.game) { this.game.dispose(); this.game = null; }
    this.menus.show('loading', { cfg });
    Audio.stopMusic(1.2);
    await nextFrame(); await nextFrame();
    const g = new Game(this, cfg);
    try {
      await g.load((p, txt) => this.menus.setLoading(p, txt));
    } catch (e) {
      console.error(e);
      this.menus.setLoading(1, 'Error al cargar: ' + e.message);
      return;
    }
    this.game = g;
    this.renderScale = 1; this.resize();
    this.menus.hide();
    this.menuActive = false;
    document.body.classList.add('ingame');
    g.start();
  }
  showPause() { this.menus.show('pause'); }
  resumeGame() { if (this.game) this.game.resume(); }
  quitMatch() {
    document.body.classList.remove('ingame');
    if (this.game) { this.game.dispose(); this.game = null; }
    this.input.enabled = false;
    this.menus.show('main');
    Audio.playMusic();
  }
  showResults(summary) {
    if (!this.game) return;
    document.body.classList.remove('ingame');
    this.game.dispose(); this.game = null;
    this.input.enabled = false;
    this.menus.show('results', { summary });
    this.menus.animateResults();
    Audio.playMusic();
    if (summary.lvlAfter > summary.lvlBefore) setTimeout(() => Audio.ui2d('ui_levelup', 0.8), 700);
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const S = Profile.s;
    const minDt = 1 / (S.fpsTarget || 60) - 0.002;
    const dt = (now - this.last) / 1000;
    if (S.fpsTarget < 120 && dt < minDt) return;
    this.last = now;
    const g = this.game;
    if (g && g.started) {
      g.frame(dt);
      this.dynamicResolution(dt);
    } else if (this.menuActive || !g) {
      this.menuScene.render(Math.min(dt, 0.05));
    }
  }
  dynamicResolution(dt) {
    if (!Profile.s.dynRes) return;
    this.frameTimes.push(dt);
    this.dynT += dt;
    if (this.dynT < 1.5) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0; this.dynT = 0;
    const target = 1 / (Profile.s.fpsTarget || 60);
    const old = this.renderScale;
    if (avg > target * 1.15) this.renderScale = Math.max(0.55, this.renderScale - 0.1);
    else if (avg < target * 1.03 && this.renderScale < 1) this.renderScale = Math.min(1, this.renderScale + 0.05);
    if (old !== this.renderScale) { this.resize(); if (this.game) this.game.renderScale = this.renderScale; }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { new App(); } catch (e) {
    console.error(e);
    document.getElementById('fatal').textContent = 'No se pudo iniciar WebGL: ' + e.message;
    document.getElementById('fatal').style.display = 'flex';
  }
});
