import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import { volumeKeys } from '../../modules/ar-paint';
import { VOLUME_BASELINE, VOLUME_HOLD_TIMEOUT_MS } from '../config';
import { useStore, type Side } from '../store';

/**
 * Turns the hardware volume rocker into two spray triggers.
 *
 * iOS has no public "volume button pressed" API. The hack: pin the system volume where the user
 * already had it (clamped so both buttons still have somewhere to go), hide the native volume
 * HUD, and watch the volume observer — a press moves it up or down, which tells us the side; we
 * immediately snap it back so the next press is detectable again. The user's own level is restored
 * when the trigger disarms, so opening the app never turns the phone up.
 * iOS auto-repeats volume changes while the button is HELD, so "held" = events keep arriving;
 * "released" = no event for VOLUME_HOLD_TIMEOUT_MS. That gives instant press-on and ~0.4s
 * release latency, which reads as a nozzle letting go.
 *
 * Android delivers real key events, so there the native module swallows VOL± while this is
 * enabled (no volume panel, no volume change) and reports exact press and release.
 */
export function useVolumeTrigger(
  enabled: boolean,
  handlers: { onHoldStart: (side: Side) => void; onHoldEnd: (side: Side) => void },
) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    if (Platform.OS === 'android' && volumeKeys) {
      const keys = volumeKeys;
      let down: Side | null = null;
      keys.setIntercepted(true);
      const sub = keys.addListener(({ key, action }) => {
        const dbg = useStore.getState().debug;
        useStore.getState().setDebug({ volEvents: dbg.volEvents + 1 });
        const side: Side = key === 'up' ? 'A' : 'B';
        if (action === 'down') {
          if (down && down !== side) h.current.onHoldEnd(down);
          down = side;
          h.current.onHoldStart(side);
        } else if (down === side) {
          down = null;
          h.current.onHoldEnd(side);
        }
      });
      return () => {
        sub.remove();
        keys.setIntercepted(false);
        if (down) { const s = down; down = null; h.current.onHoldEnd(s); }
      };
    }
    let held: Side | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const release = () => {
      if (held) { const s = held; held = null; h.current.onHoldEnd(s); }
      timer = null;
    };
    // the user's level is the baseline (clamped so a press in either direction still registers); restored on disarm
    let baseline = VOLUME_BASELINE, original: number | null = null;
    const reset = () => VolumeManager.setVolume(baseline, { showUI: false }).catch(() => {});

    // iOS only reports outputVolume changes while an audio session is active.
    VolumeManager.enable(true).catch(() => {});
    VolumeManager.setActive(true).catch(() => {});
    VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {});
    VolumeManager.getVolume().then((v) => {
      if (disposed) return;
      const cur = typeof v === 'number' ? v : (v as { volume: number }).volume;
      original = cur;
      baseline = Math.min(0.8, Math.max(0.2, Math.round(cur * 16) / 16));
      reset();
    }).catch(reset);
    // expo-audio players deactivate the session when they stop, which silences volume events; re-arm often
    const keepAlive = setInterval(() => { VolumeManager.setActive(true).catch(() => {}); reset(); }, 1500);

    const sub = VolumeManager.addVolumeListener(({ volume }) => {
      if (disposed) return;
      const dbg = useStore.getState().debug;
      useStore.getState().setDebug({ volEvents: dbg.volEvents + 1, lastVol: Math.round(volume * 100) / 100 });
      const delta = volume - baseline;
      if (Math.abs(delta) < 0.02) return; // our own reset echoing back
      const side: Side = delta > 0 ? 'A' : 'B';
      if (held !== side) {
        if (held) h.current.onHoldEnd(held);
        held = side;
        h.current.onHoldStart(side);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(release, VOLUME_HOLD_TIMEOUT_MS);
      reset();
    });

    return () => {
      disposed = true;
      clearInterval(keepAlive);
      if (timer) clearTimeout(timer);
      release();
      sub.remove();
      VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => {});
      if (original !== null) VolumeManager.setVolume(original, { showUI: false }).catch(() => {});
    };
  }, [enabled]);
}
