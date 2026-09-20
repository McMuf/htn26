import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { useStore } from '../store';
import { PAINT_MAX, PAINT_REGEN_PER_SEC } from '../config';
import { colorName } from './economy';
import { computeHeat } from './heat';
import { CosprayWidget } from '../../widgets/CosprayWidget';
import { saveWidgetSnapshot, todayPayload, type WidgetSnapshot, type WidgetSpot } from './widgetSnapshot';

/**
 * The Android half of the widget bridge — the counterpart of the App Group write in widget.ts.
 *
 * Android redraws a widget from two places, so this does two jobs:
 *  1. persist the snapshot to AsyncStorage, so the headless task handler can redraw when the app
 *     is not running (widget-task-handler.tsx)
 *  2. push a live redraw through requestWidgetUpdate while the app is open, since Android's own
 *     update schedule bottoms out at 30 minutes
 *
 * The payload comes from the same helpers the iOS path uses — todayPayload for the quests,
 * computeHeat for the map — so the two platforms cannot drift apart in what they show.
 */
const WIDGET_NAME = 'Cospray';
const THROTTLE_MS = 3000;
const MAX_SPOTS = 12;

export function startAndroidWidgetSync() {
  let last = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const build = (): WidgetSnapshot => {
    const st = useStore.getState();
    const now = Math.floor(Date.now() / 1000);
    const today = todayPayload(st);

    let spots: WidgetSpot[] = [];
    let radiusM = 250;
    let seeded = false;
    const loc = st.location;
    if (loc) {
      const heat = computeHeat(Object.values(st.canvases), loc.lat, loc.lng, st.painter?.id ?? null, st.discovered);
      radiusM = heat.radiusM;
      seeded = heat.seeded;
      spots = heat.spots.slice(0, MAX_SPOTS).map((s) => ({ n: s.n, dx: s.dx, dy: s.dy, d: s.d, b: s.b, w: s.w }));
    }

    return {
      v: 2,
      paintA: Math.round(st.paint.A),
      paintB: Math.round(st.paint.B),
      colorA: st.settings.optionA.color,
      colorB: st.settings.optionB.color,
      nameA: colorName(st.settings.optionA.color),
      nameB: colorName(st.settings.optionB.color),
      refillAtA: Math.floor(now + (PAINT_MAX - st.paint.A) / PAINT_REGEN_PER_SEC),
      refillAtB: Math.floor(now + (PAINT_MAX - st.paint.B) / PAINT_REGEN_PER_SEC),
      tag: st.painter?.name ?? 'COSPRAY',
      streak: today.streak,
      todayStrokes: today.strokes,
      todayPieces: today.pieces,
      todayPaint: today.paint,
      quests: today.quests.map((q) => ({ id: q.id, title: q.title, got: q.got, goal: q.goal, claimed: q.claimed })),
      spots,
      radiusM,
      seeded,
      at: now,
    };
  };

  const push = () => {
    const snap = build();
    // Redraw only when something visible moved: paint in 5 % steps, refill in 5 s buckets — the
    // same buckets the iOS path uses, so both platforms redraw on the same events.
    const key = JSON.stringify({
      ...snap,
      at: 0,
      paintA: Math.round(snap.paintA / 5),
      paintB: Math.round(snap.paintB / 5),
      refillAtA: Math.round(snap.refillAtA / 5),
      refillAtB: Math.round(snap.refillAtB / 5),
    });
    if (key === last) return;
    last = key;

    void saveWidgetSnapshot(snap);
    try {
      requestWidgetUpdate({
        widgetName: WIDGET_NAME,
        renderWidget: (info) => (
          <CosprayWidget snap={snap} widthDp={info?.width ?? 160} heightDp={info?.height ?? 160} />
        ),
        widgetNotFound: () => {
          // Nothing on the home screen; the snapshot is still saved for whenever one is added.
        },
      });
    } catch (e) {
      console.warn('[widget] update failed', e);
    }
  };

  const unsub = useStore.subscribe(() => {
    if (!timer) timer = setTimeout(() => { timer = null; push(); }, THROTTLE_MS);
  });
  push();
  return () => { unsub(); if (timer) clearTimeout(timer); };
}
