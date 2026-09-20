import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTopPieces, toggleUpvote, type TopPiece } from '../data/sync';
import { useStore } from '../store';


/**
 * Port of the native board. The twenty most-upvoted pieces, refreshed every 8 s — the thing being
 * ranked is the art, not the artist. Voting is optimistic and reconciled from the server's count,
 * and the pull-to-refresh control is a refresh button on the web.
 */

const REFRESH_MS = 8_000;

export function LeaderboardScreen() {
  const me = useStore((s) => s.painter);
  const [rows, setRows] = useState<TopPiece[]>([]);
  const [loading, setLoading] = useState(true); // first fetch starts on mount
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await fetchTopPieces(20);
      if (!alive.current) return;
      setRows(next);
      setErr(null);
    } catch (e) {
      if (!alive.current) return;
      setErr(e instanceof Error && e.message ? e.message : 'offline');
    }
    if (alive.current) setLoading(false);
  }, []);

  const refresh = useCallback(() => { setLoading(true); void load(); }, [load]);

  useEffect(() => {
    alive.current = true;
    void load();
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => { alive.current = false; window.clearInterval(id); };
  }, [load, refresh]);

  const data = rows;
  const isMe = (p: TopPiece) => !!me && p.author_id === me.id;
  const pieceName = (p: TopPiece) => p.title?.trim() || `${p.author_name}'s piece`;

  // Optimistic: move the number now, reconcile with the server, roll back if it refuses.
  const vote = async (p: TopPiece) => {
    const before = rows;
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, voted: !r.voted, upvotes: Math.max(0, r.upvotes + (r.voted ? -1 : 1)) } : r)));
    try {
      const res = await toggleUpvote(p.id);
      setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, voted: res.voted, upvotes: res.count } : r)));
      void load();
    } catch {
      setRows(before);
    }
  };

  return (
    <div className="tg-board-root">
      <style>{BOARD_CSS}</style>
      <div className="tg-board-head">
        <h1 className="tg-board-h1">TOP PIECES</h1>
        <button
          type="button"
          className={`tg-board-refresh${loading ? ' is-loading' : ''}`}
          onClick={() => { if (!loading) refresh(); }}
          aria-label="Refresh leaderboard"
          aria-busy={loading}>
          ↻
        </button>
      </div>
      {err && <div className="tg-board-err">Board offline ({err})</div>}
      {data.length === 0 ? (
        <div className="tg-board-empty">Nothing on the wall yet. Go tag something.</div>
      ) : (
        <ol className="tg-board-list">
          {data.map((p, i) => (
            <li key={p.id} className={`tg-board-row${isMe(p) ? ' is-me' : ''}`}>
              <span className="tg-board-rank">{i + 1}</span>
              <span className="tg-board-name">
                {pieceName(p)}
                <span className="tg-board-by"> by {p.author_name}</span>
              </span>
              <span className="tg-board-stat">{p.views} views</span>
              <button
                type="button"
                className={`tg-board-vote${p.voted ? ' is-on' : ''}`}
                onClick={() => void vote(p)}
                aria-pressed={p.voted}
                aria-label={`${p.voted ? 'Remove your upvote from' : 'Upvote'} ${pieceName(p)}`}>
                ▲ {p.upvotes}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const BOARD_CSS = `
.tg-board-by{opacity:.55;font-weight:400}
.tg-board-vote{appearance:none;border:1px solid #ffffff22;background:#ffffff0d;color:#fff;font:inherit;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;min-width:58px}
.tg-board-vote:hover{background:#ffffff1a}
.tg-board-vote.is-on{background:#59d92d;border-color:#59d92d;color:#0b2a05}
.tg-board-root{box-sizing:border-box;width:100%;height:100vh;height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#0b0b0f;color:#fff;padding:calc(env(safe-area-inset-top,0px) + 28px) 16px calc(env(safe-area-inset-bottom,0px) + 110px)}
.tg-board-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.tg-board-h1{margin:0;color:#fff;font-weight:900;font-size:22px;letter-spacing:3px}
.tg-board-refresh{appearance:none;-webkit-appearance:none;border:1px solid #ffffff22;background:#ffffff11;color:#fff;font-size:18px;line-height:1;width:36px;height:36px;border-radius:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .15s}
.tg-board-refresh:active{opacity:.6}
.tg-board-refresh.is-loading{animation:tg-board-spin .8s linear infinite;opacity:.7}
@keyframes tg-board-spin{to{transform:rotate(360deg)}}
.tg-board-err{color:#ff5c1a;font-size:12px;margin-bottom:8px}
.tg-board-list{list-style:none;margin:0;padding:0}
.tg-board-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #ffffff11}
.tg-board-row.is-me{background:#ff2d9522;margin:0 -8px;padding-left:8px;padding-right:8px;border-radius:8px}
.tg-board-rank{color:#ffe600;font-weight:900;width:28px;flex:0 0 28px;font-size:16px}
.tg-board-name{color:#fff;font-weight:800;flex:1;min-width:0;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tg-board-stat{color:#ffffffaa;font-size:12px;white-space:nowrap}
.tg-board-empty{color:#ffffff88;margin-top:40px;text-align:center}
`;
