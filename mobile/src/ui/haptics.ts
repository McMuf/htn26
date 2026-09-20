import * as Haptics from 'expo-haptics';
import { useStore } from '../store';

const on = () => useStore.getState().settings.haptics;
const quiet = (p: Promise<unknown>) => { p.catch(() => {}); };

/**
 * The app's haptic vocabulary, all gated on Settings -> Haptics. Spray-engine feedback (hiss,
 * blockers) lives in the hooks and stays as it is; everything UI goes through here.
 */
export const haptic = {
  /** Any tap: dock, chips, rows, swatches. */
  tap: () => { if (on()) quiet(Haptics.selectionAsync()); },
  /** A slab button pressing in. */
  press: () => { if (on()) quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); },
  /** Claimed, bought, step done. */
  success: () => { if (on()) quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); },
  /** Something refused. */
  warn: () => { if (on()) quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)); },
  /** Big moments: dropping into the app, sharing, finding a piece. */
  heavy: () => { if (on()) quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)); },
};
