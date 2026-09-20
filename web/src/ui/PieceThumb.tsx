import { useEffect, useRef } from 'react';
import { renderPiece } from '../site/render';
import { useStore } from '../store';
import { fetchStrokesFor } from '../data/pieces';

/** A piece as its paint, rendered to a canvas (the web has no wall photos). Loads strokes on demand. */
export function PieceThumb({ canvasId, width, height }: { canvasId: string; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const strokes = useStore((s) => s.strokes[canvasId]);
  useEffect(() => { if (!strokes) fetchStrokesFor(canvasId).catch(() => {}); }, [canvasId, strokes]);
  useEffect(() => { if (ref.current) renderPiece(ref.current, strokes ?? [], width, height, '#150a36'); }, [strokes, width, height]);
  return <canvas ref={ref} className="thumb" width={width} height={height} />;
}
