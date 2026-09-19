import { useCallback, useEffect, useRef, useState } from 'react';
import { PAINT_MAX, SHAKE_MIN_TO_SPRAY } from '../config';
import { useStore } from '../store';
import type { Blocker, Side } from '../types';

/** Web port of ../../src/components/HUD.tsx — reanimated → CSS animations, Pressable → pointer events. */

export function Reticle({ spraying }: { spraying: boolean }) {
  return (
    <div className="reticle-wrap">
      <div className={`reticle${spraying ? ' on' : ''}`}>
        <div className="reticle-dot" />
      </div>
    </div>
  );
}

export function PaintMeters() {
  const paint = useStore((s) => s.paint);
  const settings = useStore((s) => s.settings);
  return (
    <div className="meters">
      <Meter label="HOLD A" color={settings.optionA.color} value={paint.A} cap={settings.optionA.cap} />
      <Meter label="HOLD B" color={settings.optionB.color} value={paint.B} cap={settings.optionB.cap} />
    </div>
  );
}

function Meter({ label, color, value, cap }: { label: string; color: string; value: number; cap: string }) {
  const frac = value / PAINT_MAX;
  return (
    <div className="meter">
      <div className="meter-bg">
        <div className="meter-bar" style={{ height: `${Math.max(2, frac * 100)}%`, backgroundColor: color, opacity: frac < 0.15 ? 0.5 : 1 }} />
      </div>
      <div className="meter-label">{label}</div>
      <div className="meter-sub" style={{ color }}>{cap}</div>
      <div className="meter-pct">{Math.round(frac * 100)}%</div>
    </div>
  );
}

export function CanMeter() {
  const shake = useStore((s) => s.shake);
  const low = shake < SHAKE_MIN_TO_SPRAY;
  return (
    <div className="can">
      <div className={`can-body${low ? ' wobble' : ''}`}>
        <div className="can-nozzle" />
        <div className="can-fill-bg">
          <div className="can-fill" style={{ height: `${Math.round(shake * 100)}%`, backgroundColor: low ? '#ff5c1a' : '#7cff3a' }} />
        </div>
      </div>
      <div className={`can-label${low ? ' low' : ''}`}>{low ? 'SHAKE CAN' : `charge ${Math.round(shake * 100)}%`}</div>
    </div>
  );
}

const BLOCKER_MSG: Record<Exclude<Blocker, null>, string> = {
  'no-location': 'Waiting for GPS…',
  'outside-geofence': 'Outside Waterloo Region — paint zone',
  shake: 'Shake the can first!',
  empty: 'Out of paint — wait for it to refill',
  'no-sensors': 'No compass yet — allow motion access and move the phone',
};
// orientation events are flowing but no absolute (magnetic-north) heading has been applied yet
const NO_COMPASS_FIX_MSG = 'No compass fix yet — hold the phone upright and move it in a figure-8 to calibrate';

export function BlockerBanner({ blocker }: { blocker: Blocker }) {
  const sensors = useStore((s) => s.debug.sensors);
  if (!blocker) return null;
  const msg = blocker === 'no-sensors' && sensors === 'relative' ? NO_COMPASS_FIX_MSG : BLOCKER_MSG[blocker];
  return <div className="banner" role="status">{msg}</div>;
}

/**
 * Two big hold-to-spray buttons (the web has no volume buttons). Pointer events cover touch,
 * mouse and pen; ArrowUp / ArrowDown hold on a keyboard for desktop testing. Everything is
 * released if the page hides or loses focus so a stroke can never get stuck "on".
 */
export function HoldButtons({ onStart, onEnd, keyboard = true }: { onStart: (s: Side) => void; onEnd: (s: Side) => void; keyboard?: boolean }) {
  const settings = useStore((s) => s.settings);
  const [pressed, setPressed] = useState<Record<Side, boolean>>({ A: false, B: false });
  const cbs = useRef({ onStart, onEnd });
  useEffect(() => { cbs.current = { onStart, onEnd }; });
  const press = useCallback((side: Side, on: boolean) => {
    setPressed((p) => (p[side] === on ? p : { ...p, [side]: on }));
    if (on) cbs.current.onStart(side); else cbs.current.onEnd(side);
  }, []);

  useEffect(() => {
    if (!keyboard) return;
    const sideOf = (e: KeyboardEvent): Side | null => (e.key === 'ArrowUp' ? 'A' : e.key === 'ArrowDown' ? 'B' : null);
    const down = (e: KeyboardEvent) => { const s = sideOf(e); if (!s) return; e.preventDefault(); if (!e.repeat) press(s, true); };
    const up = (e: KeyboardEvent) => { const s = sideOf(e); if (!s) return; e.preventDefault(); press(s, false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [keyboard, press]);

  useEffect(() => {
    const release = () => { press('A', false); press('B', false); };
    const onVis = () => { if (document.visibilityState !== 'visible') release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', onVis); release(); };
  }, [press]);

  return (
    <div className="hold-row">
      {(['A', 'B'] as Side[]).map((side) => {
        const opt = side === 'A' ? settings.optionA : settings.optionB;
        const on = pressed[side];
        return (
          <button
            key={side}
            type="button"
            className={`hold-btn${on ? ' pressed' : ''}`}
            style={{ borderColor: opt.color, backgroundColor: on ? `${opt.color}cc` : '#0008' }}
            aria-label={`Hold to spray option ${side} (${opt.name})`}
            aria-pressed={on}
            onPointerDown={(e) => { e.preventDefault(); press(side, true); }}
            onPointerUp={() => press(side, false)}
            onPointerCancel={() => press(side, false)}
            onPointerLeave={() => press(side, false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            HOLD {side}
          </button>
        );
      })}
    </div>
  );
}
