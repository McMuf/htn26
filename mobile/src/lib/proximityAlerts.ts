import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { HOT, compass, heatWeights } from './heat';
import { useStore } from '../store';
import type { Canvas } from '../types';

/**
 * "Hot spot nearby": a local banner the first time a hot piece (normalised heat >= HOT) pulls you in.
 * Foreground only (the location watch is when-in-use), one banner per piece per half hour, permission
 * asked lazily the first time it would fire. Everything is best-effort and never throws into the caller.
 */
const COOLDOWN_MS = 30 * 60e3;
const fired = new Map<string, number>();
let handlerSet = false, asked = false, granted = false;

async function ensurePermission() {
  if (granted) return true;
  if (!handlerSet) {
    handlerSet = true;
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return (granted = true);
  if (asked || !cur.canAskAgain) return false;
  asked = true;
  const req = await Notifications.requestPermissionsAsync();
  return (granted = !!req.granted);
}

/** Called whenever the discovery "pull" target changes. */
export function maybeAlert(c: Canvas, distanceM: number, bearing: number) {
  if (Platform.OS === 'web') return;
  const last = fired.get(c.id) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  const w = heatWeights(Object.values(useStore.getState().canvases))[c.id] ?? 0;
  if (w < HOT) return;
  fired.set(c.id, Date.now());
  (async () => {
    try {
      if (!(await ensurePermission())) return;
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Hot spot nearby', body: `${c.title ?? `${c.author_name}'s piece`} · ${Math.round(distanceM)} m ${compass(bearing)} · follow the sparkle`, sound: false },
        trigger: null,
      });
    } catch {}
  })();
}
