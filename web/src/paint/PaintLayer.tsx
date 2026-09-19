import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { WALL_PITCH_RANGE, WALL_PX_PER_DEG, WALL_YAW_RANGE } from '../config';
import { clamp, wrapDiff } from '../lib/geo';
import { getPose } from '../hooks/usePose';
import { useStore } from '../store';
import { getWall, hasWall } from './Wall';

export type WallView = {
  canvasId: string;
  heading: number; // canvas centre heading
  resolve: number; // 0 = invisible/blurred, 1 = crisp
};

// Full-screen bitmaps are redrawn on every pose change; above 2× the blur pass stops fitting a frame.
const MAX_DPR = 2;
const D2R = Math.PI / 180;

// fixed, under the HUD (which should sit at z-index ≥ 10), over the camera <video> (z-index ≤ 1)
const STYLE: CSSProperties = {
  position: 'fixed', inset: 0, width: '100%', height: '100%',
  pointerEvents: 'none', zIndex: 2, display: 'block', touchAction: 'none',
};

/**
 * Draws every nearby wall raster over the camera (port of the native PaintLayer). The view
 * transform maps the wall's angular space onto the screen using the current pose: yaw offsets
 * slide it sideways, pitch slides it vertically, and the phone's roll rotates it about the
 * screen centre so paint stays level with the world. Runs its own rAF loop off getPose() so it
 * never re-renders React; a frame is only repainted when the pose, the FOV, the wall list or
 * the shared wallVersion changed.
 */
export function PaintLayer({ walls }: { walls: WallView[] }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const wallsRef = useRef(walls);
  wallsRef.current = walls;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = 1, cssW = 0, cssH = 0;
    let dirty = true;
    let lastYaw = NaN, lastPitch = NaN, lastRoll = NaN, lastHfov = NaN, lastVersion = -1;
    let lastWalls: WallView[] | null = null;

    const fit = () => {
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      cssW = w; cssH = h;
      dirty = true;
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(canvas);
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);

    const draw = (yaw: number, pitch: number, roll: number, hfov: number, ws: WallView[]) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!ws.length || cssW <= 0 || cssH <= 0 || !(hfov > 0)) return;
      // screen px per degree: hfov spans the phone's SHORT edge in either orientation (the web is
      // not portrait-locked, and roll already levels the layer in landscape)
      const s = Math.min(cssW, cssH) / hfov;
      const k = s / WALL_PX_PER_DEG; // wall px → screen px
      const cx = cssW / 2, cy = cssH / 2;
      for (const w of ws) {
        if (!hasWall(w.canvasId)) continue; // nothing painted there yet — skip allocating a blank raster
        const wall = getWall(w.canvasId);
        const resolve = clamp(w.resolve, 0, 1);
        const dYaw = wrapDiff(w.heading, yaw);
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.translate(cx, cy);
        ctx.rotate(-roll * D2R);
        ctx.translate((dYaw - WALL_YAW_RANGE) * s, -(WALL_PITCH_RANGE - pitch) * s);
        ctx.scale(k, k);
        ctx.globalAlpha = 0.15 + 0.85 * resolve;
        const blur = (1 - resolve) * 22; // in wall px; resolves from a smear into a piece
        if (blur > 0.5) {
          // canvas filters work in output-bitmap pixels regardless of the CTM; Safari may ignore this
          // property entirely, in which case the alpha ramp alone carries the resolve effect.
          try { ctx.filter = `blur(${(blur * k * dpr).toFixed(2)}px)`; } catch {}
        }
        try { ctx.drawImage(wall.canvas, 0, 0); } catch {}
        ctx.restore();
      }
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const pose = getPose();
      const st = useStore.getState();
      const hfov = st.settings.hfov;
      const version = st.wallVersion;
      const ws = wallsRef.current;
      if (!dirty && pose.yaw === lastYaw && pose.pitch === lastPitch && pose.roll === lastRoll &&
        hfov === lastHfov && version === lastVersion && ws === lastWalls) return;
      lastYaw = pose.yaw; lastPitch = pose.pitch; lastRoll = pose.roll;
      lastHfov = hfov; lastVersion = version; lastWalls = ws;
      dirty = false;
      draw(pose.yaw, pose.pitch, pose.roll, hfov, ws);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
  }, []);

  return <canvas ref={ref} style={STYLE} aria-hidden="true" />;
}
