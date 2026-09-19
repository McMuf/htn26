import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import { useStore } from '../store';

/** Mirrors paint levels into the App Group so the home-screen widget (targets/widget) can show the can. */
const APP_GROUP = 'group.com.hamzakhan.tagged';
let storage: ExtensionStorage | null = null;
let last = '';
let timer: ReturnType<typeof setTimeout> | null = null;

export function startWidgetSync() {
  if (Platform.OS !== 'ios') return () => {};
  try { storage = new ExtensionStorage(APP_GROUP); } catch { return () => {}; }
  const push = () => {
    const st = useStore.getState();
    const snap = {
      paintA: Math.round(st.paint.A), paintB: Math.round(st.paint.B), shake: Math.round(st.shake * 100),
      colorA: st.settings.optionA.color, colorB: st.settings.optionB.color, tag: st.painter?.name ?? 'TAGGED',
    };
    const key = JSON.stringify(snap);
    if (key === last) return;
    last = key;
    try {
      storage!.set('paintA', snap.paintA); storage!.set('paintB', snap.paintB); storage!.set('shake', snap.shake);
      storage!.set('colorA', snap.colorA); storage!.set('colorB', snap.colorB); storage!.set('tag', snap.tag);
      storage!.set('updatedAt', Math.floor(Date.now() / 1000));
      ExtensionStorage.reloadWidget();
    } catch {}
  };
  // paint changes 30×/s while spraying; the widget only needs a few updates a minute
  const unsub = useStore.subscribe(() => { if (!timer) timer = setTimeout(() => { timer = null; push(); }, 3000); });
  push();
  return () => { unsub(); if (timer) clearTimeout(timer); };
}
