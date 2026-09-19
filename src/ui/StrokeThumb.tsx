import React, { useMemo } from 'react';
import { Canvas, Group, Rect, Skia } from '@shopify/react-native-skia';
import { useStore } from '../store';
import { isMock } from '../data/mock';
import { seededRng } from '../lib/ids';
import type { Stroke } from '../types';

export type Dab = { x: number; y: number; r: number; a: number; color: string };

/**
 * A piece as a pixel mosaic: every dab is snapped to a coarse grid, so a 4000-dab wall becomes at
 * most a couple of thousand squares and reads as chunky digitised art. Compass strokes are in
 * degrees, AR strokes in anchor-local metres; either way the cloud is normalised to its bounds.
 * Mock canvases (no strokes) get a deterministic scribble so grids aren't empty.
 */
export function StrokeThumb({ canvasId, width, height, radius = 0, bg = '#171033', cell = 3 }: {
  canvasId: string; width: number; height: number; radius?: number; bg?: string; cell?: number;
}) {
  const strokes = useStore((s) => s.strokes[canvasId] ?? s.previewStrokes[canvasId]);
  const tiles = useMemo(() => mosaic(layoutDabs(strokes ?? [], canvasId, width, height), cell), [strokes, canvasId, width, height, cell]);
  const clip = useMemo(() => (radius > 0 ? Skia.RRectXY(Skia.XYWHRect(0, 0, width, height), radius, radius) : Skia.RRectXY(Skia.XYWHRect(0, 0, width, height), 0, 0)), [radius, width, height]);
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Group clip={clip}>
        <Rect x={0} y={0} width={width} height={height} color={bg} />
        {tiles.map((t, i) => <Rect key={i} x={t.x} y={t.y} width={t.s} height={t.s} color={t.color} opacity={t.a} />)}
      </Group>
    </Canvas>
  );
}

export function mosaic(dabs: Dab[], cell: number) {
  const m = new Map<string, { x: number; y: number; s: number; color: string; a: number }>();
  for (const d of dabs) {
    const s = Math.max(cell, Math.round((d.r * 2) / cell) * cell);
    const x = Math.round((d.x - s / 2) / cell) * cell, y = Math.round((d.y - s / 2) / cell) * cell;
    const a = d.a > 0.6 ? 1 : d.a > 0.3 ? 0.75 : 0.5;
    const k = `${x},${y},${s}`;
    const prev = m.get(k);
    if (!prev || a >= prev.a) m.set(k, { x, y, s, color: d.color, a });
  }
  return [...m.values()];
}

export function layoutDabs(strokes: Stroke[], id: string, w: number, h: number): Dab[] {
  let pts: { x: number; y: number; s: number; a: number; color: string }[] = [];
  for (const st of strokes) for (const p of st.points) {
    if (p[4] === 1 && pts.length > 2000) continue;
    pts.push({ x: p[0], y: -p[1], s: p[2], a: Math.min(1, p[3] * 2.5), color: st.color });
  }
  if (!pts.length) {
    if (!isMock(id) && !strokes.length) return [];
    const rng = seededRng(id);
    const colors = ['#ff2d95', '#19e6ff', '#ffe600', '#7cff3a'];
    for (let k = 0; k < 3; k++) {
      const color = colors[Math.floor(rng() * colors.length)];
      let x = rng() * 100, y = rng() * 60, vx = rng() - 0.5, vy = rng() - 0.5;
      for (let i = 0; i < 60; i++) { vx += (rng() - 0.5) * 0.6; vy += (rng() - 0.5) * 0.6; x += vx * 2; y += vy * 2; pts.push({ x, y, s: 3 + rng() * 3, a: 0.5, color }); }
    }
  }
  if (pts.length > 4000) pts = pts.filter((_, i) => i % Math.ceil(pts.length / 4000) === 0);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const span = Math.max(maxX - minX, maxY - minY, 1e-3);
  const scale = (Math.min(w, h) * 0.8) / span;
  const ox = w / 2 - ((minX + maxX) / 2) * scale, oy = h / 2 - ((minY + maxY) / 2) * scale;
  const sizeScale = scale * (pts[0].s > 1 ? 0.35 : 1); // degrees are chunkier than metres
  return pts.map((p) => ({ x: ox + p.x * scale, y: oy + p.y * scale, r: Math.max(1.2, Math.min(w * 0.08, p.s * sizeScale)), a: p.a, color: p.color }));
}
