import type { Painter, Stroke } from '../types';

/**
 * The phone's local economy (mobile/src/lib/economy.ts), the parts the web shows: coins earned
 * by spraying, daily stats and quests, crews. Everything derives from synced stats + local counters.
 */
export const PAINT_PER_COIN = 8;
export const coinsOf = (painter: Painter | null, s: { bonus: number; spent: number }) =>
  Math.max(0, Math.floor((painter?.paint_used ?? 0) / PAINT_PER_COIN) + s.bonus - s.spent);

const BASE_NAMES: Record<string, string> = {
  '#59d92d': 'Neon green', '#4a22b8': 'Dark purple', '#ff2d95': 'Hot pink', '#19e6ff': 'Cyan', '#ffe600': 'Yellow', '#7cff3a': 'Lime',
  '#ff5c1a': 'Orange', '#b26bff': 'Violet', '#ffffff': 'White', '#111111': 'Black',
};
export const colorName = (hex: string) => BASE_NAMES[hex.toLowerCase()] ?? hex;

export type DayStats = { strokes: number; pieces: number; paint: number; streak: number };
export function dayStats(all: Pick<Stroke, 'author_id' | 'created_at' | 'paint_used' | 'canvas_id'>[], me?: string): DayStats {
  const mine = me ? all.filter((s) => s.author_id === me) : [];
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = mine.filter((s) => new Date(s.created_at) >= start);
  const days = new Set(mine.map((s) => s.created_at.slice(0, 10)));
  let streak = 0; const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  return { strokes: today.length, pieces: new Set(today.map((s) => s.canvas_id)).size, paint: Math.round(today.reduce((a, s) => a + s.paint_used, 0)), streak };
}
export type Mission = { id: string; title: string; hot: string; goal: number; reward: number; get: (d: DayStats) => number };
export const MISSIONS: Mission[] = [
  { id: 'paint', title: 'Spray {n} paint', hot: '60', goal: 60, reward: 20, get: (d) => d.paint },
  { id: 'walls', title: 'Paint on {n} walls', hot: '2', goal: 2, reward: 25, get: (d) => d.pieces },
  { id: 'strokes', title: 'Make {n} strokes', hot: '8', goal: 8, reward: 15, get: (d) => d.strokes },
];
export const dayKey = () => new Date().toISOString().slice(0, 10);

export const CREWS = [
  { id: 'e7', name: 'E7 CREW', blurb: 'engineering courtyard' },
  { id: 'slc', name: 'SLC SQUAD', blurb: 'student life centre' },
  { id: 'dc', name: 'DC DRIPPERS', blurb: 'the library wall' },
  { id: 'uptown', name: 'UPTOWN TAGS', blurb: 'downtown Waterloo' },
];
