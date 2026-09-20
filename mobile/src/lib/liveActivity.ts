import { AppState, Platform } from 'react-native';
import * as LA from '../../modules/live-activity';
import { useStore, type Side } from '../store';
import { colorName } from './economy';

/**
 * Mirrors the painting session into the Dynamic Island / lock screen. Started on the first hold,
 * updated once a second while a colour is held, ended after a few seconds idle, on tab change, or when
 * the app leaves the foreground. Everything is fire-and-forget and iOS-only, so the spray loop never
 * waits on it.
 */
const IDLE_END_MS = 8000; // long enough that the island doesn't pop in and out between strokes
const TICK_MS = 1000;
const supported = Platform.OS === 'ios' && LA.hasLiveActivity;

let active = false, starting: Promise<unknown> | null = null, startedAt = 0, strokes = 0, side: Side | null = null;
let tick: ReturnType<typeof setInterval> | null = null, idle: ReturnType<typeof setTimeout> | null = null;

const state = (): LA.LaState => { const p = useStore.getState().paint; return { paintA: Math.round(p.A), paintB: Math.round(p.B), sprayingSide: side ?? 'none', startedAt, strokes }; };
const attrs = (): LA.LaAttrs => {
  const st = useStore.getState();
  return { tag: st.painter?.name ?? 'COSPRAY', colorA: st.settings.optionA.color, nameA: colorName(st.settings.optionA.color), colorB: st.settings.optionB.color, nameB: colorName(st.settings.optionB.color) };
};
const push = () => { if (active) LA.update(state()).catch(() => {}); };

export function laSprayStart(s: Side) {
  if (!supported) return;
  try {
    side = s;
    if (idle) { clearTimeout(idle); idle = null; }
    if (!active && !starting) {
      if (!LA.areActivitiesEnabled()) return;
      startedAt = Date.now(); strokes = 0;
      starting = LA.start(attrs(), state()).then(() => { active = true; push(); }).catch(() => {}).finally(() => { starting = null; });
    } else push();
    if (!tick) tick = setInterval(push, TICK_MS);
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
  if (active || starting) {
    const fin = state();
    active = false;
    (starting ?? Promise.resolve()).then(() => LA.end(fin, 2)).catch(() => {});
  }
}

/** Call once at app start: clears activities left over from a killed app, ends the session when the app leaves the foreground. */
export function startLiveActivityLifecycle() {
  if (!supported) return () => {};
  LA.endAll().catch(() => {});
  const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') laEnd(); });
  return () => sub.remove();
}
