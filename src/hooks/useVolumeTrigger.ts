import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { VolumeManager } from 'react-native-volume-manager';
import { VOLUME_BASELINE, VOLUME_HOLD_TIMEOUT_MS } from '../config';
import { useStore, type Side } from '../store';

/**
 * Turns the hardware volume rocker into two spray triggers.
 *
 * iOS has no public "volume button pressed" API. The hack: pin the system volume to 0.5, hide
 * the native volume HUD, and watch the volume observer — a press moves it up or down, which
 * tells us the side; we immediately snap it back to 0.5 so the next press is detectable again.
 * iOS auto-repeats volume changes while the button is HELD, so "held" = events keep arriving;
 * "released" = no event for VOLUME_HOLD_TIMEOUT_MS. That gives instant press-on and ~0.4s
 * release latency, which reads as a nozzle letting go.
 */
export function useVolumeTrigger(
  enabled: boolean,
  handlers: { onHoldStart: (side: Side) => void; onHoldEnd: (side: Side) => void },
) {
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let held: Side | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const release = () => {
      if (held) { const s = held; held = null; h.current.onHoldEnd(s); }
      timer = null;
    };
    const reset = () => VolumeManager.setVolume(VOLUME_BASELINE, { showUI: false }).catch(() => {});

    // iOS only reports outputVolume changes while an audio session is active.
    VolumeManager.enable(true).catch(() => {});
    VolumeManager.setActive(true).catch(() => {});
    VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => {});
    reset();
    const keepAlive = setInterval(() => { VolumeManager.setActive(true).catch(() => {}); reset(); }, 4000);

    const sub = VolumeManager.addVolumeListener(({ volume }) => {
      if (disposed) return;
      const dbg = useStore.getState().debug;
      useStore.getState().setDebug({ volEvents: dbg.volEvents + 1, lastVol: Math.round(volume * 100) / 100 });
      const delta = volume - VOLUME_BASELINE;
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
    };
  }, [enabled]);
}
