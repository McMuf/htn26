import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchLeaderboard } from '../data/sync';
import { CREWS, colorName, dayStats } from '../lib/economy';
import { PALETTE } from '../config';
import { Avatar, Header, Panel, Tile } from '../ui/kit';
import type { Painter } from '../types';

const hueOf = (name: string) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % (PALETTE.length - 1)];

/** Your week card, the live leaderboard, your crew. */
export function SocialScreen() {
  const painter = useStore((s) => s.painter);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const strokes = useStore((s) => s.strokes);
  const discovered = useStore((s) => s.discovered);
  const [board, setBoard] = useState<Painter[]>([]);
  const load = useCallback(() => { fetchLeaderboard().then(setBoard).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const mine = useMemo(() => Object.values(strokes).flat().filter((s) => s.author_id === painter?.id), [strokes, painter?.id]);
  const stats = useMemo(() => dayStats(mine, painter?.id), [mine, painter?.id]);
  const topColors = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of mine) m.set(s.color, (m.get(s.color) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [mine]);
  const crew = CREWS.find((c) => c.id === settings.crew);
  const [first, second, third] = board;
  const col = (p: Painter | undefined, place: 1 | 2 | 3) => (
    <div className="podium-col">
      {p ? (<><Avatar name={p.name} color={hueOf(p.name)} size={place === 1 ? 52 : 44} /><div className="t-small ellipsis" style={{ color: 'var(--white)', fontWeight: 700 }}>{p.name}</div><div className="t-card" style={{ color: 'var(--green-hi)' }}>{Math.round(p.paint_used)}</div></>) : <div className="t-card">—</div>}
      <div className={`pxbox ${place === 1 ? 'green' : place === 2 ? 'dark' : 'red'} podium-block`} style={{ height: place === 1 ? 96 : place === 2 ? 68 : 52 }}>{place}</div>
    </div>
  );
  return (
    <div className="tabscreen">
      <div className="backdrop" />
      <Header title="SOCIAL" />
      <section className="pxbox tile panel">
        <div className="panel-head"><div className="wordmark sm">COSPRAY</div><div className="t-label">MY WEEK</div></div>
        <div className="t-eyebrow">ON REPEAT</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[0, 1, 2].map((i) => { const c = topColors[i]; return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: '100%', aspectRatio: '1', background: c ? c[0] : 'var(--well)', border: '3px solid var(--ink)' }} />
              <div className="t-small">{c ? `${c[1]} times` : '—'}</div>
              <div className="t-small ellipsis">{c ? colorName(c[0]).toLowerCase() : 'no colour'}</div>
            </div>); })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Tile n={painter?.strokes ?? 0} label="strokes" big /><Tile n={Math.round(painter?.paint_used ?? 0)} label="paint sprayed" big /><Tile n={Object.keys(discovered).length} label="walls found" big />
        </div>
        <div className="panel-head"><div><div className="t-card">{painter?.name ?? 'anon'}</div><div className="t-small">{crew ? crew.name : `${stats.streak} day streak`}</div></div><div className="t-micro">JOIN ME ON COSPRAY</div></div>
      </section>

      <Panel title="TOP PAINTERS" right={<span className="t-eyebrow">LIVE</span>}>
        {board.length === 0 ? <div className="t-sub">No painters yet. Go tag something.</div> : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>{col(second, 2)}{col(first, 1)}{col(third, 3)}</div>
            {board.slice(3, 10).map((p, i) => (
              <div key={p.id} className="prow" style={{ padding: '4px 0', minHeight: 0, background: p.id === painter?.id ? 'var(--line)' : undefined }}>
                <div className="pxbox dark flat" style={{ width: 30, height: 28, display: 'grid', placeItems: 'center', fontWeight: 700 }}>{i + 4}</div>
                <div className="prow-main"><div style={{ fontWeight: 700 }}>{p.name}</div></div>
                <div className="t-small">{Math.round(p.paint_used)} paint</div>
              </div>
            ))}
          </>
        )}
      </Panel>

      <Panel title="YOUR CREW">
        <div><div className="t-h">{crew?.name ?? 'NO CREW YET'}</div><div className="t-small">{crew ? crew.blurb : 'pick one to rep it on your card'} · saved in this browser</div></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CREWS.map((c) => <button key={c.id} type="button" className={`pchip pxbox dark press${settings.crew === c.id ? ' on' : ''}`} onClick={() => setSettings({ crew: settings.crew === c.id ? null : c.id })}>{c.name}</button>)}
        </div>
      </Panel>
    </div>
  );
}
