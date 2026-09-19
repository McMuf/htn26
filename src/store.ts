import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  DEFAULT_OPTION_A, DEFAULT_OPTION_B, GEOFENCE_BYPASS_DEFAULT, HFOV_DEG, PAINT_MAX, SprayOption,
} from './config';
import type { Canvas, Painter, Stroke } from './types';

export type Side = 'A' | 'B';
export type Settings = {
  optionA: SprayOption;
  optionB: SprayOption;
  onScreenButtons: boolean; // fallback if volume interception misbehaves
  geofenceBypass: boolean;
  hfov: number;
  haptics: boolean;
  sound: boolean;
  showPlanes: boolean; // AR: tint detected surfaces
};
export type Loc = { lat: number; lng: number; accuracy: number };

type State = {
  painter: Painter | null;
  settings: Settings;
  paint: Record<Side, number>;
  shake: number; // 0..1 can charge
  location: Loc | null;
  canvases: Record<string, Canvas>;
  strokes: Record<string, Stroke[]>;
  discovered: Record<string, true>;
  wallVersion: number; // bumps whenever any wall raster changes
  online: boolean;
  tab: 'paint' | 'map' | 'board';
  settingsOpen: boolean;
  debug: { volEvents: number; lastVol: number; held: string; blocker: string; walls: number; poseReady: boolean; surface: string };
  setDebug: (d: Partial<State['debug']>) => void;

  setPainter: (p: Painter | null) => void;
  setSettings: (s: Partial<Settings>) => void;
  setPaint: (side: Side, v: number) => void;
  setShake: (v: number) => void;
  setLocation: (l: Loc | null) => void;
  upsertCanvas: (c: Canvas) => void;
  setCanvases: (cs: Canvas[]) => void;
  setStrokes: (canvasId: string, ss: Stroke[]) => void;
  addStroke: (s: Stroke) => boolean;
  markDiscovered: (id: string) => void;
  bumpWalls: () => void;
  setOnline: (b: boolean) => void;
  setTab: (t: State['tab']) => void;
  setSettingsOpen: (b: boolean) => void;
};

const DEFAULT_SETTINGS: Settings = {
  optionA: DEFAULT_OPTION_A,
  optionB: DEFAULT_OPTION_B,
  onScreenButtons: false,
  geofenceBypass: GEOFENCE_BYPASS_DEFAULT,
  hfov: HFOV_DEG,
  haptics: true,
  sound: true,
  showPlanes: true,
};

export const useStore = create<State>((set, get) => ({
  painter: null,
  settings: DEFAULT_SETTINGS,
  paint: { A: PAINT_MAX, B: PAINT_MAX },
  shake: 1, // a fresh can: the first spray works without shaking; charge decays from there
  location: null,
  canvases: {},
  strokes: {},
  discovered: {},
  wallVersion: 0,
  online: false,
  tab: 'paint',
  settingsOpen: false,
  debug: { volEvents: 0, lastVol: 0.5, held: '-', blocker: '-', walls: 0, poseReady: false, surface: '?' },
  setDebug: (d) => set((st) => ({ debug: { ...st.debug, ...d } })),

  setPainter: (painter) => { set({ painter }); persist('painter', painter); },
  setSettings: (s) => { const settings = { ...get().settings, ...s }; set({ settings }); persist('settings', settings); },
  setPaint: (side, v) => set((st) => ({ paint: { ...st.paint, [side]: v } })),
  setShake: (shake) => set({ shake }),
  setLocation: (location) => set({ location }),
  upsertCanvas: (c) => set((st) => ({ canvases: { ...st.canvases, [c.id]: { ...st.canvases[c.id], ...c } } })),
  setCanvases: (cs) => set((st) => {
    const canvases = { ...st.canvases };
    for (const c of cs) canvases[c.id] = { ...canvases[c.id], ...c };
    return { canvases };
  }),
  setStrokes: (canvasId, ss) => set((st) => ({ strokes: { ...st.strokes, [canvasId]: ss } })),
  addStroke: (s) => {
    const cur = get().strokes[s.canvas_id] ?? [];
    if (cur.some((x) => x.id === s.id)) return false;
    set((st) => ({ strokes: { ...st.strokes, [s.canvas_id]: [...cur, s] } }));
    return true;
  },
  markDiscovered: (id) => { const discovered = { ...get().discovered, [id]: true as const }; set({ discovered }); persist('discovered', discovered); },
  bumpWalls: () => set((st) => ({ wallVersion: st.wallVersion + 1 })),
  setOnline: (online) => set({ online }),
  setTab: (tab) => set({ tab }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));

function persist(key: string, value: unknown) {
  AsyncStorage.setItem(`tagged:${key}`, JSON.stringify(value)).catch(() => {});
}

export async function hydrateStore() {
  try {
    const [p, s, d] = await Promise.all(['painter', 'settings', 'discovered'].map((k) => AsyncStorage.getItem(`tagged:${k}`)));
    useStore.setState({
      painter: p ? JSON.parse(p) : null,
      settings: { ...DEFAULT_SETTINGS, ...(s ? JSON.parse(s) : {}) },
      discovered: d ? JSON.parse(d) : {},
    });
  } catch {}
}
