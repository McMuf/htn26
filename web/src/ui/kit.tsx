import type { ReactNode } from 'react';
import { useStore } from '../store';
import { coinsOf } from '../lib/economy';

/** The phone's kit (mobile/src/ui/kit.tsx) as DOM: slabs, panels, tiles, meters. Styling lives in theme.css. */
export function Panel({ title, right, children, tone = '' }: { title?: string; right?: ReactNode; children?: ReactNode; tone?: '' | 'tile' | 'purple' | 'dark' }) {
  return (
    <section className={`pxbox panel ${tone}`}>
      {title ? <div className="panel-head"><div className="t-label">{title}</div>{right}</div> : null}
      {children}
    </section>
  );
}
export function Tile({ n, label, big }: { n: string | number; label: string; big?: boolean }) {
  return <div className="pxbox tile tile-stat"><div className="n" style={big ? { fontSize: 32 } : undefined}>{n}</div><div className="l">{label}</div></div>;
}
export function SegBar({ value, color, segs = 10, smooth }: { value: number; color: string; segs?: number; smooth?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  if (smooth) return <div className="bar" style={{ ['--c' as string]: color }}><span style={{ width: `${v * 100}%` }} /></div>;
  const lit = Math.round(v * segs);
  return <div className="segbar" style={{ ['--c' as string]: color }}>{Array.from({ length: segs }, (_, i) => <span key={i} className={i < lit ? 'on' : ''} />)}</div>;
}
export function Avatar({ name, color, size = 48 }: { name?: string | null; color: string; size?: number }) {
  return <div className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.5 }}>{(name?.[0] ?? 'C').toUpperCase()}</div>;
}
export function CoinPill() {
  const painter = useStore((s) => s.painter);
  const settings = useStore((s) => s.settings);
  return <div className="pill pxbox flat"><span className="coin" /> {coinsOf(painter, settings)}</div>;
}
export function Header({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="header">
      <div className="header-main"><div className="t-title">{title}</div>{sub ? <div className="t-sub">{sub}</div> : null}</div>
      {right ?? <CoinPill />}
    </div>
  );
}
export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return <Panel><div className="empty"><div className="t-h">{title}</div>{sub ? <div className="t-sub">{sub}</div> : null}{action}</div></Panel>;
}
export const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
