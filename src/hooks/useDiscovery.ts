import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { CANVAS_VISIBLE_RADIUS_M, DISCOVERED_RADIUS_M, DISCOVERY_SHIMMER_RADIUS_M } from '../config';
import { bearingDeg, clamp, haversineM, wrapDiff } from '../lib/geo';
import { useStore } from '../store';
import { incrementViews } from '../data/sync';
import type { Pose } from './usePose';
import type { Canvas } from '../types';
import type { WallView } from '../paint/PaintLayer';

export type Discovery = {
  walls: WallView[];
  /** The nearest undiscovered piece pulling at you, if any. */
  pull: null | { canvas: Canvas; distance: number; bearing: number; relBearing: number; resolve: number };
  /** Canvas just discovered (for the reveal card). */
  justFound: Canvas | null;
  /** Discovered/own canvas currently in front of you (for the info chip). */
  focused: Canvas | null;
};

/**
 * Discovery = the emotional beat. Ranks nearby canvases by distance; anything not yet
 * discovered (and not yours) shimmers from DISCOVERY_SHIMMER_RADIUS_M, fades/blurs in across
 * CANVAS_VISIBLE_RADIUS_M → DISCOVERED_RADIUS_M, and once you're inside DISCOVERED_RADIUS_M
 * looking at it for a beat, it "locks": view count increments and the author tag appears.
 */
export function useDiscovery(pose: React.MutableRefObject<Pose>): Discovery {
  const [state, setState] = useState<Discovery>({ walls: [], pull: null, justFound: null, focused: null });
  const lookingSince = useRef<Record<string, number>>({});
  const foundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const st = useStore.getState();
      const loc = st.location;
      const me = st.painter?.id;
      const yaw = pose.current.yaw;
      const walls: WallView[] = [];
      let pull: Discovery['pull'] = null;
      let focused: Canvas | null = null;
      let focusedRel = 999;
      let justFound: Canvas | null = null;
      if (loc) {
        for (const c of Object.values(st.canvases)) {
          if (c.flagged) continue;
          const d = haversineM(loc.lat, loc.lng, c.lat, c.lng);
          if (d > DISCOVERY_SHIMMER_RADIUS_M) continue;
          const mine = !!me && c.author_id === me;
          const known = mine || !!st.discovered[c.id];
          const b = bearingDeg(loc.lat, loc.lng, c.lat, c.lng);
          // when standing on top of a canvas, bearing is meaningless — use its wall heading
          const towards = d < 6 ? c.heading : b;
          const rel = wrapDiff(towards, yaw);
          let resolve = known ? 1 : clamp((CANVAS_VISIBLE_RADIUS_M - d) / (CANVAS_VISIBLE_RADIUS_M - DISCOVERED_RADIUS_M), 0, 1);
          if (!known) {
            // lock-on: inside the discovered radius and roughly facing the wall for ~0.8s
            const facing = Math.abs(wrapDiff(c.heading, yaw)) < 45 || d < 4;
            if (d <= DISCOVERED_RADIUS_M && facing) {
              const since = lookingSince.current[c.id] ?? (lookingSince.current[c.id] = Date.now());
              if (Date.now() - since > 800) {
                st.markDiscovered(c.id);
                incrementViews(c.id);
                justFound = c;
                resolve = 1;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }
            } else delete lookingSince.current[c.id];
            if (!pull || d < pull.distance) pull = { canvas: c, distance: d, bearing: b, relBearing: rel, resolve };
          } else if (d < CANVAS_VISIBLE_RADIUS_M && Math.abs(wrapDiff(c.heading, yaw)) < focusedRel && Math.abs(wrapDiff(c.heading, yaw)) < 40) {
            focused = c; focusedRel = Math.abs(wrapDiff(c.heading, yaw));
          }
          if (d < CANVAS_VISIBLE_RADIUS_M || known) walls.push({ canvasId: c.id, heading: c.heading, resolve });
        }
      }
      setState((prev) => {
        const jf = justFound ?? prev.justFound;
        if (justFound) {
          if (foundTimer.current) clearTimeout(foundTimer.current);
          foundTimer.current = setTimeout(() => setState((p) => ({ ...p, justFound: null })), 6000);
        }
        // avoid re-render churn when nothing meaningful changed
        const same = prev.justFound === jf && prev.focused?.id === focused?.id && prev.pull?.canvas.id === pull?.canvas.id &&
          Math.abs((prev.pull?.distance ?? 0) - (pull?.distance ?? 0)) < 0.3 && Math.abs((prev.pull?.relBearing ?? 0) - (pull?.relBearing ?? 0)) < 2 &&
          prev.walls.length === walls.length && prev.walls.every((w, i) => w.canvasId === walls[i].canvasId && Math.abs(w.resolve - walls[i].resolve) < 0.02);
        if (same) return prev;
        return { walls, pull, justFound: jf, focused: justFound ?? focused };
      });
    }, 120);
    return () => clearInterval(id);
  }, []);

  return state;
}
