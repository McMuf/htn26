import { useEffect } from 'react';
import { useStore } from '../store';
import { coinsOf } from '../lib/economy';

type Tab = 'paint' | 'profile' | 'vault' | 'explore' | 'social';
const ITEMS: { key: Tab; label: string; hint: string }[] = [
  { key: 'paint', label: 'CREATE', hint: 'aim at a wall and spray' },
  { key: 'profile', label: 'PROFILE', hint: 'your can, quests, today' },
  { key: 'vault', label: 'VAULT', hint: 'every wall you painted' },
  { key: 'explore', label: 'EXPLORE', hint: 'hot zones near you' },
  { key: 'social', label: 'SOCIAL', hint: 'top painters, your crew' },
];

/**
 * The web's navigation: the phone's dock as a side drawer. A pixel ☰ key top-left opens it; on a
 * wide screen it stays docked. The current tab is the purple slab, CREATE the green can key.
 */
export function Sidebar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const open = useStore((s) => s.navOpen);
  const setOpen = useStore((s) => s.setNavOpen);
  const painter = useStore((s) => s.painter);
  const settings = useStore((s) => s.settings);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  return (
    <>
      <button type="button" className="navkey pxbox plate press" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="bars" aria-hidden="true"><i /><i /><i /></span>
      </button>
      {open && <div className="nav-backdrop" onClick={() => setOpen(false)} />}
      <nav className={`sidebar${open ? ' open' : ''}`} aria-label="Sections">
        <div className="sidebar-head">
          <div className="wordmark sm">COSPRAY</div>
          <div className="t-small">{painter?.name ?? 'painter'}</div>
        </div>
        {ITEMS.map((it) => {
          const on = tab === it.key;
          const cls = it.key === 'paint' ? (on ? 'purple' : 'green') : on ? 'purple' : 'dark';
          return (
            <button key={it.key} type="button" className={`navitem pxbox press ${cls}`} aria-current={on ? 'page' : undefined} onClick={() => setTab(it.key)}>
              {it.key === 'paint' && <span className="navcan" aria-hidden="true" />}
              <span className="navitem-main">
                <span className="navitem-label">{it.label}</span>
                <span className="navitem-hint">{it.hint}</span>
              </span>
            </button>
          );
        })}
        <div className="sidebar-foot">
          <div className="ppill pxbox flat"><span className="coin" /> {coinsOf(painter, settings)}</div>
          <button type="button" className="btn sm pxbox dark press" onClick={() => { setOpen(false); setSettingsOpen(true); }}>SETTINGS</button>
        </div>
      </nav>
    </>
  );
}
