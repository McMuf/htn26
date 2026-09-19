import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  CANVAS_JOIN_RADIUS_M, DWELL_POOL_SECONDS, DWELL_RADIUS_DEG, GEOFENCE, PAINT_COST_PER_SEC, PAINT_EMPTY_THRESHOLD,
  PAINT_LOW_THRESHOLD, PAINT_MAX, PAINT_REGEN_PER_SEC, SHAKE_DECAY_SECONDS, SHAKE_GAIN_PER_EVENT, SHAKE_MIN_TO_SPRAY,
} from '../config';
import { haversineM, wrap360, wrapDiff } from '../lib/geo';
import { uuid } from '../lib/ids';
import { seededRng } from '../lib/ids';
import { capRadius, getWall } from '../paint/Wall';
import { sfx } from '../audio/sfx';
import { useStore, type Side } from '../store';
import { createCanvas, uploadStroke } from '../data/sync';
import type { Pose } from './usePose';
import type { Canvas, Stroke, StrokePoint } from '../types';

export type Blocker = null | 'no-location' | 'outside-geofence' | 'shake' | 'empty';

/**
 * The spray simulation. Runs a ~30Hz tick while a trigger is held:
 *  - picks/creates the canvas you're standing at,
 *  - composites dabs into that wall at the reticle (view centre),
 *  - depletes paint, decays the can charge, detects dwell → pooling/drips,
 *  - drives hiss + haptics, and records the stroke for upload on release.
 */
export function useSprayEngine(pose: React.MutableRefObject<Pose>) {
  const held = useRef<Side | null>(null);
  const stroke = useRef<Stroke | null>(null);
  const rng = useRef<() => number>(() => Math.random());
  const activeCanvas = useRef<Canvas | null>(null);
  const dwell = useRef<{ yaw: number; pitch: number; since: number; pooled: boolean }>({ yaw: 0, pitch: 0, since: 0, pooled: false });
  const lastLowRattle = useRef(0);
  const lastTick = useRef(0);
  const hapticsAt = useRef(0);
  const blocker = useRef<Blocker>(null);
  const sprayingNow = useRef(false);

  // can charge decay + paint regen, always running
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 1000; last = now;
      const st = useStore.getState();
      if (st.shake > 0) st.setShake(Math.max(0, st.shake - dt / SHAKE_DECAY_SECONDS));
      for (const side of ['A', 'B'] as Side[]) {
        if (held.current === side) continue;
        if (st.paint[side] < PAINT_MAX) st.setPaint(side, Math.min(PAINT_MAX, st.paint[side] + PAINT_REGEN_PER_SEC * dt));
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const onShake = (mag: number) => {
    const st = useStore.getState();
    const gain = SHAKE_GAIN_PER_EVENT * Math.min(2, mag / 2.4);
    st.setShake(Math.min(1, st.shake + gain));
    const low = Math.min(st.paint.A, st.paint.B) < PAINT_LOW_THRESHOLD;
    if (st.settings.sound) low ? sfx.emptyRattle() : sfx.rattle(Math.min(1, mag / 4));
    if (st.settings.haptics) Haptics.impactAsync(low ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  };

  const computeBlocker = (): Blocker => {
    const st = useStore.getState();
    if (!st.location) return 'no-location';
    if (!st.settings.geofenceBypass && haversineM(st.location.lat, st.location.lng, GEOFENCE.lat, GEOFENCE.lng) > GEOFENCE.radiusM) return 'outside-geofence';
    if (st.shake < SHAKE_MIN_TO_SPRAY) return 'shake';
    const side = held.current;
    if (side && st.paint[side] <= PAINT_EMPTY_THRESHOLD) return 'empty';
    return null;
  };

  const pickCanvas = (): Canvas | null => {
    const st = useStore.getState();
    const loc = st.location; if (!loc) return null;
    let best: Canvas | null = null, bestD = Infinity;
    for (const c of Object.values(st.canvases)) {
      if (c.flagged) continue;
      const d = haversineM(loc.lat, loc.lng, c.lat, c.lng);
      if (d < CANVAS_JOIN_RADIUS_M && d < bestD) { best = c; bestD = d; }
    }
    if (best) return best;
    const p = st.painter;
    const c: Canvas = {
      id: uuid(), lat: loc.lat, lng: loc.lng, heading: wrap360(pose.current.yaw), title: null,
      author_id: p?.id ?? null, author_name: p?.name ?? 'anon', views: 0, stroke_count: 0, flags: 0, flagged: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    createCanvas(c);
    return c;
  };

  const start = (side: Side) => {
    if (held.current === side) return;
    if (held.current) end(held.current);
    held.current = side;
    const b = computeBlocker();
    blocker.current = b;
    const st = useStore.getState();
    if (b) {
      if (st.settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (b === 'empty' && st.settings.sound) sfx.emptyRattle();
      if (b === 'shake' && st.settings.sound) sfx.click();
      return;
    }
    const canvas = pickCanvas();
    if (!canvas) return;
    activeCanvas.current = canvas;
    const opt = side === 'A' ? st.settings.optionA : st.settings.optionB;
    const s: Stroke = {
      id: uuid(), canvas_id: canvas.id, author_id: st.painter?.id ?? null, author_name: st.painter?.name ?? 'anon',
      color: opt.color, cap: opt.cap, points: [], paint_used: 0, created_at: new Date().toISOString(),
    };
    stroke.current = s;
    rng.current = seededRng(s.id);
    dwell.current = { yaw: pose.current.yaw, pitch: pose.current.pitch, since: Date.now(), pooled: false };
    lastTick.current = Date.now();
    sprayingNow.current = true;
    if (st.settings.sound) sfx.click();
  };

  const end = (side: Side) => {
    if (held.current !== side) return;
    held.current = null;
    sprayingNow.current = false;
    sfx.setHiss(false, 0, 0);
    const s = stroke.current;
    stroke.current = null;
    if (s && s.points.length > 0) {
      useStore.getState().addStroke(s);
      const p = useStore.getState().painter;
      if (p) useStore.getState().setPainter({ ...p, strokes: p.strokes + 1, paint_used: p.paint_used + s.paint_used });
      uploadStroke(s);
    }
  };

  // spray tick
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      const side = held.current;
      if (!side) { blocker.current = null; return; }
      const dt = Math.min(0.1, (now - lastTick.current) / 1000);
      acc += dt; lastTick.current = now;
      if (acc < 1 / 30) return; // ~30Hz
      const step = acc; acc = 0;

      const st = useStore.getState();
      const b = computeBlocker();
      blocker.current = b;
      const s = stroke.current;
      if (b || !s) {
        sfx.setHiss(false, 0, 0);
        if (b === 'empty' && now - lastLowRattle.current > 1500 && st.settings.sound) { lastLowRattle.current = now; sfx.emptyRattle(); }
        return;
      }
      const canvas = activeCanvas.current!;
      const opt = side === 'A' ? st.settings.optionA : st.settings.optionB;
      const strength = Math.min(1, st.shake / 0.35); // weak spray as the can loses charge
      const paintFrac = st.paint[side] / PAINT_MAX;
      const flow = strength * (0.55 + 0.45 * Math.min(1, paintFrac * 3)); // sputters when nearly empty
      const pr = pose.current;
      const yaw = wrapDiff(pr.yaw, canvas.heading);
      const pitch = pr.pitch;
      const radius = capRadius(opt.cap) * (0.75 + 0.35 * strength);
      const alpha = 0.16 * flow;
      const wall = getWall(canvas.id);
      if (st.debug.surface !== wall.backend) st.setDebug({ surface: wall.backend });
      const pt: StrokePoint = [round2(yaw), round2(pitch), round2(radius), round2(alpha), 0];
      wall.applyPoint(pt, opt.color, rng.current);
      s.points.push(pt);

      // dwell → pooling + drips
      const d = dwell.current;
      const moved = Math.hypot(wrapDiff(yaw, d.yaw), pitch - d.pitch);
      if (moved > DWELL_RADIUS_DEG) { d.yaw = yaw; d.pitch = pitch; d.since = now; d.pooled = false; }
      else if (!d.pooled && now - d.since > DWELL_POOL_SECONDS * 1000) {
        d.pooled = true;
        const dp: StrokePoint = [round2(yaw + (rng.current() - 0.5) * radius), round2(pitch - radius * 0.4), round2(2 + rng.current() * 3.5), round2(0.6 * flow), 1];
        wall.applyPoint(dp, opt.color, rng.current);
        s.points.push(dp);
        if (st.settings.sound) sfx.pool();
        if (st.settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
        d.since = now; // allow another drip after another dwell period
        setTimeout(() => { d.pooled = false; }, 600);
      }

      const cost = PAINT_COST_PER_SEC[opt.cap] * step * (0.6 + 0.4 * strength);
      s.paint_used += cost;
      st.setPaint(side, Math.max(0, st.paint[side] - cost));
      st.bumpWalls();

      if (st.settings.sound) sfx.setHiss(true, flow, Math.max(0, -pitch / 60));
      if (st.settings.haptics && now - hapticsAt.current > 70) {
        hapticsAt.current = now;
        Haptics.impactAsync(flow > 0.6 ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
      }
      if (st.paint[side] < PAINT_LOW_THRESHOLD && now - lastLowRattle.current > 2500 && st.settings.sound) {
        lastLowRattle.current = now; sfx.emptyRattle();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { start, end, onShake, blocker, held, sprayingNow };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
