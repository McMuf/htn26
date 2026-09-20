import { AppState, Platform } from 'react-native';
import * as LA from 'expo-live-activity';
import * as Location from 'expo-location';
import { useStore, type Side } from '../store';
import { colorName } from './economy';
import { renderLocatorBar } from './locatorBar';
import { compass, computeHeat, heatLabel } from './heat';
import { clamp } from './geo';
import { DISCOVERED_RADIUS_M, DISCOVERY_SHIMMER_RADIUS_M } from '../config';
import type { Pose } from '../hooks/usePose';

/**
 * Cospray on the Dynamic Island / lock screen, through expo-live-activity (Software Mansion's
 * ActivityKit module + config plugin). One activity lives for as long as the app is in the
 * foreground and has a GPS fix; it ends when the app leaves the foreground. It has two faces:
 *
 *  - radar (default): the nearest piece, how far and which way, with the island's ring filling as
 *    you close in on it (full = inside the discovery radius). The image is the locator bar — you in
 *    the middle, the three nearest pieces placed by bearing relative to where the phone points.
 *  - spraying: the colour you're holding, both cans' paint, and the stroke count, while a colour is
 *    held and for a few seconds after, then back to the radar.
 *
 * Everything is fire-and-forget and iOS-only, so the spray loop and the location watch never wait
 * on it.
 */
const RADAR_MS = 3000; // radar refresh: often enough to feel live, well under ActivityKit's update budget
const SPRAY_MS = 1000; // while a colour is held
const SPRAY_LINGER_MS = 8000; // keep the spray summary up between strokes before the radar comes back
const supported = Platform.OS === 'ios';

let id: string | null = null, strokes = 0, side: Side | null = null;
let linger: ReturnType<typeof setTimeout> | null = null, tick: ReturnType<typeof setInterval> | null = null;
let compassHeading: number | null = null; // expo-location's heading watch, for the tabs without a pose
/** Set by the paint screens so the locator bar can use their gyro-fused heading while they're up. */
export const laPose: { current: { current: Pose } | null } = { current: null };

const CONFIG: LA.LiveActivityConfig = {
  backgroundColor: '#12082b', titleColor: '#ffffff', subtitleColor: '#cdbff5',
  progressViewTint: '#59d92d', progressViewLabelColor: '#ffffff',
  timerType: 'circular', imagePosition: 'leftStretch', imageAlign: 'center', imageSize: { height: 24, width: 240 }, contentFit: 'contain',
  padding: { horizontal: 14, top: 10, bottom: 10 },
  deepLinkUrl: 'tagged://',
};

function heading(): number | null {
  const pose = laPose.current?.current;
  return pose?.ready ? pose.yaw : compassHeading;
}

function state(): LA.LiveActivityState {
  const st = useStore.getState();
  const bar = renderLocatorBar(heading());
  const image = { imageName: bar ?? 'can', dynamicIslandImageName: bar ?? 'can_island' };
  const p = st.paint;
  const cans = `${colorName(st.settings.optionA.color)} ${Math.round(p.A)}% · ${colorName(st.settings.optionB.color)} ${Math.round(p.B)}%`;

  if (side || linger) {
    const opt = side === 'B' ? st.settings.optionB : side === 'A' ? st.settings.optionA : null;
    const active = side ? Math.round(p[side]) : Math.round(Math.min(p.A, p.B));
    return {
      title: opt ? `SPRAYING ${colorName(opt.color).toUpperCase()}` : `${st.painter?.name ?? 'COSPRAY'} · PAUSED`,
      subtitle: `${cans} · ${strokes} stroke${strokes === 1 ? '' : 's'}`,
      progressBar: { progress: active / 100 }, ...image,
    };
  }

  // radar
  const loc = st.location;
  if (!loc) return { title: `${st.painter?.name ?? 'COSPRAY'} · SEARCHING`, subtitle: 'waiting for a GPS fix', progressBar: { progress: 0 }, ...image };
  const heat = computeHeat(Object.values(st.canvases), loc.lat, loc.lng, st.painter?.id ?? null, st.discovered);
  const near = [...heat.spots].sort((a, b) => a.d - b.d);
  const nearest = near[0];
  if (!nearest) return { title: 'NOTHING NEARBY', subtitle: `paint the first piece here · ${cans}`, progressBar: { progress: 0 }, ...image };
  const name = nearest.n.toUpperCase();
  const tag = nearest.mine ? 'yours' : nearest.found ? 'found' : heatLabel(nearest.w).toLowerCase();
  const title = nearest.d <= DISCOVERED_RADIUS_M ? `◉ ${name} · HERE`
    : nearest.d <= DISCOVERY_SHIMMER_RADIUS_M ? `◉ ${name} · ${nearest.d}M`
    : `${near.length} PIECE${near.length === 1 ? '' : 'S'} NEAR YOU`;
  return {
    title,
    subtitle: `${nearest.n} by ${nearest.who} · ${nearest.d}m ${compass(nearest.b)} · ${tag}`,
    // the island's ring: how close the nearest piece is, full once you're standing at it
    progressBar: { progress: clamp(1 - (nearest.d - DISCOVERED_RADIUS_M) / Math.max(1, heat.radiusM - DISCOVERED_RADIUS_M), 0, 1) },
    ...image,
  };
}

function push() {
  if (!supported || AppState.currentState !== 'active') return;
  try {
    if (id) LA.updateActivity(id, state());
    else if (side || useStore.getState().location) id = LA.startActivity(state(), CONFIG) ?? null; // wait for a fix (or a spray) so it never opens on an empty radar
  } catch {}
}

function schedule(ms: number) {
  if (tick) clearInterval(tick);
  tick = setInterval(push, ms);
}

export function laSprayStart(s: Side) {
  if (!supported) return;
  try {
    if (linger) { clearTimeout(linger); linger = null; } else strokes = 0; // a fresh session, not a pause between strokes
    side = s;
    push();
    schedule(SPRAY_MS);
  } catch {}
}

export function laSprayEnd() {
  if (!supported) return;
  try {
    side = null;
    if (linger) clearTimeout(linger);
    linger = setTimeout(laEnd, SPRAY_LINGER_MS);
    push();
  } catch {}
}

/** Counted when a stroke commits; the next tick ships it. */
export function laStroke() { strokes++; }

/** The spray session is over (idle, tab change, screen hidden): back to the radar. The activity stays. */
export function laEnd() {
  if (!supported) return;
  if (linger) { clearTimeout(linger); linger = null; }
  side = null;
  strokes = 0;
  push();
  if (tick) schedule(RADAR_MS);
}

function stop() {
  if (linger) { clearTimeout(linger); linger = null; }
  if (tick) { clearInterval(tick); tick = null; }
  side = null; strokes = 0;
  if (id) { const done = id; id = null; try { LA.stopActivity(done, state()); } catch {} }
}

/** Call once at app start: runs the radar while the app is in the foreground and ends it when it leaves. */
export function startLiveActivityLifecycle() {
  if (!supported) return () => {};
  const start = () => { push(); schedule(RADAR_MS); };
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') start(); else stop(); });
  if (AppState.currentState === 'active') start();
  // compass for the locator bar on the tabs that have no pose (the location permission is already asked by useLocation)
  let headingSub: Location.LocationSubscription | null = null, gone = false;
  Location.watchHeadingAsync((h) => { compassHeading = h.magHeading >= 0 ? h.magHeading : null; })
    .then((s) => { if (gone) s.remove(); else headingSub = s; })
    .catch(() => {});
  return () => { gone = true; sub.remove(); headingSub?.remove(); stop(); };
}
