import AsyncStorage from '@react-native-async-storage/async-storage';
import { PAINT_MAX } from '../config';
import { MISSIONS, dayKey, dayStats } from './economy';
import type { useStore } from '../store';

/**
 * The Android widget's data, shared between the app and the headless task handler.
 *
 * iOS puts the equivalent in the App Group (src/lib/widget.ts writes it, targets/widget reads it).
 * Android has no App Group, and the task handler runs outside the app's React tree with no access
 * to the zustand store, so the same snapshot goes through AsyncStorage instead.
 *
 * Absolute `refillAt*` timestamps rather than remaining seconds, so a stale snapshot still yields a
 * correct countdown whenever it happens to be rendered.
 */
export const WIDGET_SNAPSHOT_KEY = 'cospray.widget.snapshot.v2';

/** A piece near you. Mirrors HotSpot from src/lib/heat.ts, trimmed to what the widget draws. */
export type WidgetSpot = {
  n: string;
  /** metres east / north of the user — the radar's coordinates */
  dx: number;
  dy: number;
  /** distance (m) and compass bearing (deg) from the user */
  d: number;
  b: number;
  /** normalised heat, 0..1 */
  w: number;
};

/** One daily quest, straight from MISSIONS via todayPayload. */
export type WidgetQuest = {
  id: string;
  title: string;
  got: number;
  goal: number;
  claimed: boolean;
};

export type WidgetSnapshot = {
  v: 2;
  // cans
  paintA: number;
  paintB: number;
  colorA: string;
  colorB: string;
  nameA: string;
  nameB: string;
  /** unix seconds at which each can is full again */
  refillAtA: number;
  refillAtB: number;
  // identity + lifetime
  tag: string;
  streak: number;
  // today (the small layout)
  todayStrokes: number;
  todayPieces: number;
  todayPaint: number;
  quests: WidgetQuest[];
  // nearby (the map/radar layouts)
  spots: WidgetSpot[];
  radiusM: number;
  seeded: boolean;
  at: number;
};

export async function saveWidgetSnapshot(snap: WidgetSnapshot) {
  try {
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // Best effort: a failed write just means the widget redraws from the previous snapshot.
  }
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WidgetSnapshot;
    return parsed && parsed.v === 2 ? parsed : null;
  } catch {
    return null;
  }
}

/** Full cans and nothing nearby: what the widget shows before the app has ever run. */
export const EMPTY_SNAPSHOT: WidgetSnapshot = {
  v: 2,
  paintA: PAINT_MAX,
  paintB: PAINT_MAX,
  colorA: '#59d92d',
  colorB: '#7a45ff',
  nameA: 'GREEN',
  nameB: 'PURPLE',
  refillAtA: 0,
  refillAtB: 0,
  tag: 'COSPRAY',
  streak: 0,
  todayStrokes: 0,
  todayPieces: 0,
  todayPaint: 0,
  quests: [],
  spots: [],
  radiusM: 250,
  seeded: false,
  at: 0,
};

/** What the small widget shows: today's stats and each daily quest's progress. */
export function todayPayload(st: ReturnType<typeof useStore.getState>) {
  const stats = dayStats(Object.values(st.strokes).flat(), st.painter?.id);
  const day = dayKey();
  return {
    strokes: stats.strokes, pieces: stats.pieces, paint: Math.round(stats.paint), streak: stats.streak,
    quests: MISSIONS.map((m) => ({ id: m.id, title: m.title.replace('{n}', m.hot), got: Math.min(m.goal, m.get(stats)), goal: m.goal, reward: m.reward, claimed: !!st.settings.claimed[`${day}:${m.id}`] })),
  };
}
