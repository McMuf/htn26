import { useMemo } from 'react';
import { useStore } from '../store';
import { PAINT_MAX, PAINT_REGEN_PER_SEC, SHAKE_MIN_TO_SPRAY } from '../config';
import { CREWS, MISSIONS, colorName, dayKey, dayStats } from '../lib/economy';
import { Avatar, CoinPill, Panel, SegBar, Tile } from '../ui/kit';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Web port of the phone's Profile: the can, today's numbers, daily quests. */
export function ProfileScreen() {
  const painter = useStore((s) => s.painter);
  const paint = useStore((s) => s.paint);
  const shake = useStore((s) => s.shake);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const strokes = useStore((s) => s.strokes);
  const online = useStore((s) => s.online);
  const setTab = useStore((s) => s.setTab);
  const stats = useMemo(() => dayStats(Object.values(strokes).flat(), painter?.id), [strokes, painter?.id]);
  const crew = CREWS.find((c) => c.id === settings.crew);
  const low = shake < SHAKE_MIN_TO_SPRAY;
  const day = dayKey();
  return (
    <div className="screen">
      <div className="backdrop" />
      <div className="header">
        <Avatar name={painter?.name} color={settings.avatarColor} size={52} />
        <div className="header-main"><div className="t-h">{painter?.name ?? 'painter'}</div><div className="t-small">{crew ? crew.name : 'NO CREW'} · {online ? 'LIVE' : 'OFFLINE'}</div></div>
        <CoinPill />
      </div>

      <Panel title="SPRAY CAN" right={<span className="t-label" style={{ color: low ? 'var(--purple-hi)' : 'var(--green-hi)' }}>{low ? 'NEEDS A SHAKE' : 'READY'}</span>}>
        {(['A', 'B'] as const).map((side) => {
          const opt = side === 'A' ? settings.optionA : settings.optionB;
          const v = paint[side]; const full = v / PAINT_MAX >= 0.995;
          return (
            <div key={side} className="gauge">
              <div className="panel-head"><span className="t-eyebrow">{colorName(opt.color)}</span><span className="t-small">{full ? 'FULL' : `FULL IN ${mmss(Math.ceil((PAINT_MAX - v) / PAINT_REGEN_PER_SEC))}`}</span></div>
              <SegBar value={v / PAINT_MAX} color={opt.color} />
            </div>
          );
        })}
        <div className="gauge">
          <div className="panel-head"><span className="t-eyebrow">PRESSURE</span><span className="t-small">{Math.round(shake * 100)}%</span></div>
          <SegBar value={shake} color={low ? 'var(--purple-hi)' : 'var(--green-hi)'} smooth />
        </div>
        <button type="button" className="btn lg block pxbox green press" onClick={() => setTab('paint')}>GO PAINT</button>
      </Panel>

      <Panel title="TODAY">
        <div style={{ display: 'flex', gap: 8 }}>
          <Tile n={stats.strokes} label="strokes" /><Tile n={stats.pieces} label="walls" /><Tile n={stats.paint} label="paint" /><Tile n={stats.streak} label="day streak" />
        </div>
        <div className="t-small">all time · {painter?.strokes ?? 0} strokes · {Math.round(painter?.paint_used ?? 0)} paint sprayed</div>
      </Panel>

      <Panel title="DAILY QUESTS" right={<span className="t-eyebrow">RESETS AT MIDNIGHT</span>}>
        {MISSIONS.map((m) => {
          const key = `${day}:${m.id}`;
          const got = Math.min(m.goal, m.get(stats));
          const done = got >= m.goal;
          const claimed = !!settings.claimed[key];
          const [pre, post] = m.title.split('{n}');
          return (
            <div key={m.id} className="quest">
              <div className="panel-head">
                <span className="t-card">{pre}<span style={{ color: 'var(--green-hi)' }}>{m.hot}</span>{post}</span>
                <span className="t-card" style={{ color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><span className="coin" />+{m.reward}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}><SegBar value={claimed ? 1 : got / m.goal} color={claimed ? 'var(--green-hi)' : 'var(--green)'} smooth /></div>
                {claimed ? <span className="t-micro" style={{ color: 'var(--green-hi)' }}>CLAIMED</span>
                  : done ? <button type="button" className="btn sm pxbox green press" onClick={() => setSettings({ claimed: { ...settings.claimed, [key]: true }, bonus: settings.bonus + m.reward })}>CLAIM</button>
                  : <span className="t-micro">{got}/{m.goal}</span>}
              </div>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
