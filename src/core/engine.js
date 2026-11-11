// Interstellar core engine: WebGL2 renderer, quality tiers, layered HDR rendering through the film pipeline, frame loop, and a render-scale governor that trades resolution for frame rate when the GPU frame runs long.
import * as THREE from 'three';
import { FilmPipeline } from './post.js';

const QUALITY = {
  low: { maxPixels: 0.75e6, msaa: 0, bloomLevels: 5, shadowSize: 1024 },
  medium: { maxPixels: 1.3e6, msaa: 2, bloomLevels: 6, shadowSize: 2048 },
  high: { maxPixels: 2.1e6, msaa: 4, bloomLevels: 7, shadowSize: 2048 },
  ultra: { maxPixels: 2.6e6, msaa: 4, bloomLevels: 8, shadowSize: 4096 },
};

export class Engine {
  constructor({ canvas, quality = 'ultra', dynamic = true } = {}) {
    this.canvas = canvas;
    this.dynamic = dynamic;
    this.scale = 1;
    this._gov = 0;
    this.qualityName = QUALITY[quality] ? quality : 'ultra';
    this.quality = QUALITY[this.qualityName];
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.info.autoReset = false;
    this.renderer = renderer;
    this.film = new FilmPipeline(renderer, { msaa: this.quality.msaa, bloomLevels: this.quality.bloomLevels });
    this.scene = null;
    this.camera = null;
    this.background = null;
    this.time = 0;
    this.timeScale = 1;
    this.frameMs = 0;
    this.fps = 0;
    this.gpuMs = 0;
    this.lastInfo = { calls: 0, triangles: 0 };
    this._updaters = new Set();
    this._preRenders = new Set();
    this._postRenders = new Set();
    this._running = false;
    this._last = 0;
    this._frame = this._frame.bind(this);
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const w = Math.max(2, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(2, this.canvas.clientHeight || window.innerHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, Math.sqrt(this.quality.maxPixels / (w * h))) * this.scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.width = size.x; this.height = size.y; this.aspect = w / h;
    this.film.setSize(size.x, size.y, Math.round(size.x / this.scale), Math.round(size.y / this.scale));
    for (const cam of [this.camera, this.background?.camera]) {
      if (cam?.isPerspectiveCamera) { cam.aspect = this.aspect; cam.updateProjectionMatrix(); }
    }
  }

  setView(scene, camera) {
    this.scene = scene; this.camera = camera;
    if (camera?.isPerspectiveCamera) { camera.aspect = this.aspect; camera.updateProjectionMatrix(); }
  }

  setBackground(scene, camera) {
    this.background = scene && camera ? { scene, camera, clearDepthAfter: true } : null;
    if (camera?.isPerspectiveCamera) { camera.aspect = this.aspect; camera.updateProjectionMatrix(); }
  }

  onUpdate(fn) { this._updaters.add(fn); return () => this._updaters.delete(fn); }

  onPreRender(fn) { this._preRenders.add(fn); return () => this._preRenders.delete(fn); }

  onPostRender(fn) { this._postRenders.add(fn); return () => this._postRenders.delete(fn); }

  start() { if (this._running) return; this._running = true; this._last = performance.now(); requestAnimationFrame(this._frame); }

  stop() { this._running = false; }

  step(dt) {
    const t0 = performance.now();
    this.time += dt;
    for (const u of [...this._updaters]) u(dt, this.time);
    this.film.update(dt);
    if (this.scene && this.camera) {
      this.renderer.info.reset();
      const timed = this._gpuBegin();
      for (const p of [...this._preRenders]) p(this.renderer, this.camera, dt);
      this.film.render([this.background, { scene: this.scene, camera: this.camera }]);
      this._gpuEnd(timed);
      this.lastInfo = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
      for (const p of [...this._postRenders]) p(this.renderer, this.camera, dt);
    }
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.1;
  }

  _gpuBegin() {
    const gl = this.renderer.getContext();
    if (this._gpuExt === undefined) this._gpuExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') || null;
    const ext = this._gpuExt;
    if (!ext) return false;
    if (this._gpuQuery) {
      if (!gl.getQueryParameter(this._gpuQuery, gl.QUERY_RESULT_AVAILABLE)) return false;
      const ns = gl.getQueryParameter(this._gpuQuery, gl.QUERY_RESULT);
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) this.gpuMs = this.gpuMs ? this.gpuMs + (ns / 1e6 - this.gpuMs) * 0.2 : ns / 1e6;
      gl.deleteQuery(this._gpuQuery);
      this._gpuQuery = null;
    }
    this._gpuQuery = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, this._gpuQuery);
    return true;
  }

  _gpuEnd(timed) {
    if (timed) this.renderer.getContext().endQuery(this._gpuExt.TIME_ELAPSED_EXT);
  }

  _govern(raw) {
    if (!this.dynamic || !this.scene) return;
    this._gov += raw;
    if (this._gov < 0.8) return;
    this._gov = 0;
    const timed = this.gpuMs > 0;
    const ms = timed ? this.gpuMs : this.fps > 1 ? 1000 / this.fps : 0;
    if (!ms) return;
    const old = this.scale;
    let s = old;
    if (ms > 29.5) s = Math.max(0.62, old * Math.min(0.96, Math.max(0.8, Math.sqrt(26 / ms))));
    else if ((timed ? ms < 22.5 : this.fps > 56) && old < 1) s = Math.min(1, old * 1.04);
    if (Math.abs(s - old) < 0.015) return;
    this.scale = s;
    this.gpuMs *= (s * s) / (old * old);
    this.resize();
  }

  _frame(now) {
    if (!this._running) return;
    requestAnimationFrame(this._frame);
    const raw = Math.max(0, (now - this._last) / 1000);
    if (raw > 0) this.fps += (1 / raw - this.fps) * 0.05;
    const dt = Math.min(0.05, raw) * this.timeScale;
    this._last = now;
    this.step(dt);
    this._govern(raw);
  }
}
