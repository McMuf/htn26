import { AppState, Platform } from 'react-native';
import * as LA from 'expo-live-activity';
import { useStore, type Side } from '../store';
import { colorName } from './economy';
import { renderLocatorBar } from './locatorBar';
import type { Pose } from '../hooks/usePose';

/**
 * The painting session on the Dynamic Island / lock screen, through expo-live-activity (Software
 * Mansion's ActivityKit module + config plugin). Started on the first hold, updated once a second
 * while a colour is held, ended after a few seconds idle, on tab change, or when the app leaves the
 * foreground. Everything is fire-and-forget and iOS-only, so the spray loop never waits on it.
 */
const IDLE_END_MS = 8000; // long enough that the island doesn't pop in and out between strokes
const TICK_MS = 1000;
const supported = Platform.OS === 'ios';

let id: string | null = null, strokes = 0, side: Side | null = null;
/** Set by the paint screens so the locator bar knows which way the phone points. */
export const laPose: { current: { current: Pose } | null } = { current: null };
let tick: ReturnType<typeof setInterval> | null = null, idle: ReturnType<typeof setTimeout> | null = null;

const CONFIG: LA.LiveActivityConfig = {
  backgroundColor: '#12082b', titleColor: '#ffffff', subtitleColor: '#cdbff5',
  progressViewTint: '#59d92d', progressViewLabelColor: '#ffffff',
  timerType: 'circular', imagePosition: 'leftStretch', imageAlign: 'center', imageSize: { height: 24, width: 240 }, contentFit: 'contain',
  padding: { horizontal: 14, top: 10, bottom: 10 },
};

function state(): LA.LiveActivityState {
  const st = useStore.getState();
  const opt = side === 'B' ? st.settings.optionB : side === 'A' ? st.settings.optionA : null;
  const p = st.paint;
  const active = side ? Math.round(p[side]) : Math.round(Math.min(p.A, p.B));
  const pose = laPose.current?.current;
  const bar = renderLocatorBar(pose?.ready ? pose.yaw : null);
  return {
    title: opt ? `SPRAYING ${colorName(opt.color).toUpperCase()}` : `${st.painter?.name ?? 'COSPRAY'} · PAUSED`,
    subtitle: `${colorName(st.settings.optionA.color)} ${Math.round(p.A)}% · ${colorName(st.settings.optionB.color)} ${Math.round(p.B)}% · ${strokes} stroke${strokes === 1 ? '' : 's'}`,
    progressBar: { progress: active / 100 },
    imageName: bar ?? 'can', dynamicIslandImageName: bar ?? 'can_island',
  };
}
const push = () => { if (id) { try { LA.updateActivity(id, state()); } catch {} } };

export function laSprayStart(s: Side) {
  if (!supported) return;
  try {
    side = s;
    if (idle) { clearTimeout(idle); idle = null; }
    if (!id) { strokes = 0; id = LA.startActivity(state(), CONFIG) ?? null; } else push();
    if (id && !tick) tick = setInterval(push, TICK_MS);
  } catch {}
}

export function laSprayEnd() {
  if (!supported) return;
  try {
    side = null;
    if (tick) { clearInterval(tick); tick = null; }
    push();
    if (idle) clearTimeout(idle);
    idle = setTimeout(laEnd, IDLE_END_MS);
  } catch {}
}

/** Counted when a stroke commits; the next tick ships it. */
export function laStroke() { strokes++; if (!tick) push(); }

export function laEnd() {
  if (!supported) return;
  if (idle) { clearTimeout(idle); idle = null; }
  if (tick) { clearInterval(tick); tick = null; }
  side = null;
  if (id) { const done = id; id = null; try { LA.stopActivity(done, state()); } catch {} }
}

/** Call once at app start: ends the session when the app leaves the foreground. */
export function startLiveActivityLifecycle() {
  if (!supported) return () => {};
  const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') laEnd(); });
  return () => sub.remove();
}
