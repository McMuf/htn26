import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { fetchAllCanvases } from '../data/sync';
import { Empty, Header, timeAgo } from '../ui/kit';
import { PieceThumb } from '../ui/PieceThumb';
import type { Canvas } from '../types';

/** Every wall you painted or added to. */
export function VaultScreen() {
  const me = useStore((s) => s.painter);
  const local = useStore((s) => s.canvases);
  const strokes = useStore((s) => s.strokes);
  const setTab = useStore((s) => s.setTab);
  const [remote, setRemote] = useState<Canvas[]>([]);
  const load = useCallback(() => { fetchAllCanvases().then(setRemote).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const contributed = useMemo(() => {
    const set = new Set<string>();
    if (me) for (const [cid, ss] of Object.entries(strokes)) if (ss.some((s) => s.author_id === me.id)) set.add(cid);
    return set;
  }, [strokes, me?.id]);
  const mine = useMemo(() => {
    const m = new Map<string, Canvas>();
    for (const c of remote) m.set(c.id, c);
    for (const c of Object.values(local)) m.set(c.id, { ...m.get(c.id), ...c });
    return [...m.values()].filter((c) => !c.flagged && me && (c.author_id === me.id || contributed.has(c.id))).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [remote, local, me?.id, contributed]);
  const totals = mine.reduce((a, c) => ({ views: a.views + c.views, strokes: a.strokes + c.stroke_count }), { views: 0, strokes: 0 });
  return (
    <div className="tabscreen">
      <div className="backdrop" />
      <Header title="VAULT" sub={`${mine.length} walls · ${totals.views} views · ${totals.strokes} strokes`} />
      {mine.length === 0 && <Empty title="Nothing saved yet." sub="Every wall you spray lands here." action={<button type="button" className="btn pxbox green press" onClick={() => setTab('paint')}>PAINT SOMETHING</button>} />}
      <div className="grid2">
        {mine.map((c) => (
          <div key={c.id} className="pxbox tile pcard">
            <PieceThumb canvasId={c.id} width={200} height={150} />
            <div className="t-card ellipsis">{c.title ?? timeAgo(c.created_at)}</div>
            <div className="t-small">{c.views} views · {c.stroke_count} strokes</div>
            {c.author_id !== me?.id && <div className="t-micro" style={{ color: 'var(--green-hi)' }}>CONTRIBUTED</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
