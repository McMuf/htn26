import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Brightness from 'expo-brightness';

/**
 * AR mode boost: the camera view is hard to read in daylight, so the screen goes to full brightness
 * while you're in Create and comes back to what it was when you leave (or the app backgrounds).
 * iOS: app-scoped brightness, no permission needed. Android asks for the system-settings permission
 * once; if refused, nothing happens.
 */
export function useArBrightness(on: boolean) {
  const saved = useRef<number | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    const boost = async () => {
      try {
        if (Platform.OS === 'android') { const p = await Brightness.requestPermissionsAsync(); if (!p.granted) return; }
        if (saved.current === null) saved.current = await Brightness.getBrightnessAsync();
        if (alive) await Brightness.setBrightnessAsync(1);
      } catch {}
    };
    const restore = async () => {
      try { if (saved.current !== null) { await Brightness.setBrightnessAsync(saved.current); saved.current = null; } } catch {}
    };
    if (on) boost(); else restore();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && on) boost(); else if (s !== 'active') restore(); });
    return () => { alive = false; sub.remove(); if (on) restore(); };
  }, [on]);
}
