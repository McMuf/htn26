import type { Cap } from './config';

/** [yaw, pitch, size(deg), alpha, kind] — kind 0 = spray dab centre, 1 = drip. Canvas-relative degrees. */
export type StrokePoint = [number, number, number, number, number];

export type Stroke = {
  id: string;
  canvas_id: string;
  author_id: string | null;
  author_name: string;
  color: string;
  cap: Cap;
  points: StrokePoint[];
  paint_used: number;
  created_at: string;
};

export type Canvas = {
  id: string;
  lat: number;
  lng: number;
  heading: number; // compass heading of the wall centre (magnetic, degrees)
  title: string | null;
  author_id: string | null;
  author_name: string;
  views: number;
  stroke_count: number;
  flags: number;
  flagged: boolean;
  created_at: string;
  updated_at: string;
};

export type Painter = { id: string; name: string; paint_used: number; strokes: number };
