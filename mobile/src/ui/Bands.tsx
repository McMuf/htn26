import React, { useMemo } from 'react';
import { Canvas, Path, Rect, Skia } from '@shopify/react-native-skia';
import { mix } from './color';

const CELL = 3;

/**
 * A posterised gradient with ordered-dither seams, sized to fit (the Backdrop's look, for cards and
 * headers). Drawn once with Skia rects.
 */
export function Bands({ width, height, top, bottom, bands = 6, style }: { width: number; height: number; top: string; bottom: string; bands?: number; style?: object }) {
  const scene = useMemo(() => {
    const bandH = Math.ceil(height / bands);
    const rows = Array.from({ length: bands }, (_, i) => ({ y: i * bandH, color: mix(top, bottom, i / Math.max(1, bands - 1)) }));
    const seams = rows.slice(1).map((b, i) => {
      const p = Skia.Path.Make();
      for (let row = 0; row < 2; row++) for (let x = 0; x < width; x += CELL) if ((x / CELL + row) % 2 === 0) p.addRect(Skia.XYWHRect(x, b.y - CELL * (2 - row), CELL, CELL));
      return { path: p, color: b.color, key: i };
    });
    return { rows, seams, bandH };
  }, [width, height, top, bottom, bands]);
  return (
    <Canvas style={[{ width, height }, style]} pointerEvents="none">
      {scene.rows.map((b, i) => <Rect key={i} x={0} y={b.y} width={width} height={scene.bandH + 1} color={b.color} />)}
      {scene.seams.map((s) => <Path key={s.key} path={s.path} color={s.color} antiAlias={false} />)}
    </Canvas>
  );
}
