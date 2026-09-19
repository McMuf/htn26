import React, { useMemo } from 'react';
import { Canvas, Circle, Group, Rect, Skia } from '@shopify/react-native-skia';
import { useStore } from '../store';
import { isMock } from '../data/mock';
import { seededRng } from '../lib/ids';
import type { Stroke } from '../types';

/**
 * A small render of a canvas's strokes for cards/grids: every dab, auto-fit to the box.
 * Compass strokes are in degrees, AR strokes in anchor-local metres — either way the point
 * cloud is normalised to its own bounds, so the thumbnail is the piece's silhouette.
 * Mock canvases (no strokes) get a deterministic generated scribble so the grid isn't empty.
 */
export function StrokeThumb({ canvasId, width, height, radius = 16 }: { canvasId: string; width: number; height: number; radius?: number }) {
  const strokes = useStore((s) => s.strokes[canvasId] ?? s.previewStrokes[canvasId]);
  const dabs = useMemo(() => layout(strokes ?? [], canvasId, width, height), [strokes, canvasId, width, height]);
  return (
    <Canvas style={{ width, height }}>
      <Group clip={Skia.RRectXY(Skia.XYWHRect(0, 0, width, height), radius, radius)}>
        <Rect x={0} y={0} width={width} height={height} color="#14141e" />
        {dabs.map((d, i) => <Circle key={i} cx={d.x} cy={d.y} r={d.r} color={d.color} opacity={d.a} />)}
      </Group>
    </Canvas>
  );
}

function layout(strokes: Stroke[], id: string, w: number, h: number) {
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
