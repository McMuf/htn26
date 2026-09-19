import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useStore } from './store';
import { sfx } from './audio/sfx';
import { useLocation } from './hooks/useLocation';
import { fetchPainter, flushPending, loadCached, loadNearby, subscribeRealtime } from './data/sync';
import { AuthScreen } from './screens/AuthScreen';
import { NameScreen } from './screens/NameScreen';
import { PaintScreen } from './screens/PaintScreen';
import { MapScreen } from './screens/MapScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/**
 * Web port of ../App.tsx. The store hydrates synchronously from localStorage, so there is no
 * "ready" gate; the cached canvases/strokes load on mount and sound is unlocked later from the
 * user gesture on the paint screen (iOS needs a tap before Web Audio / sensors / camera).
 */
export default function App() {
  const painter = useStore((s) => s.painter);
  const setPainter = useStore((s) => s.setPainter);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // outcome of the painter-row lookup for an auth uid. A browser is a "new device" for every
  // iPhone painter, so the tag prompt must wait for a SUCCESSFUL lookup: a failed one (offline,
  // timeout, RLS) must not be read as "no painter yet", or NameScreen would let them pick a
  // second tag for an account that already has one.
  const [painterLookup, setPainterLookup] = useState<{ uid: string; status: 'ok' | 'error'; message?: string } | null>(null);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const retryLookup = useCallback(() => { setPainterLookup(null); setLookupAttempt((n) => n + 1); }, []);

  useEffect(() => {
    loadCached().catch(() => {});
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => setSession(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // keep the persisted painter in sync with whoever is signed in
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { if (painter) setPainter(null); setPainterLookup(null); return; }
    const uid = session.user.id;
    if (painter?.id === uid) { setPainterLookup({ uid, status: 'ok' }); return; }
    let cancelled = false;
    fetchPainter(uid)
      .then((p) => { if (cancelled) return; setPainter(p); setPainterLookup({ uid, status: 'ok' }); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPainterLookup({ uid, status: 'error', message: e instanceof Error ? e.message : 'Network error' });
      });
    return () => { cancelled = true; };
  }, [session, lookupAttempt]);

  // a failed lookup retries by itself when the connection comes back
  useEffect(() => {
    if (painterLookup?.status !== 'error') return;
    window.addEventListener('online', retryLookup);
    return () => window.removeEventListener('online', retryLookup);
  }, [painterLookup?.status, retryLookup]);

  if (session === undefined) return <div className="screen" />;
  if (!session) return <AuthScreen />;
  if (!painter || painter.id !== session.user.id) {
    if (painterLookup?.uid !== session.user.id) return <div className="screen" />;
    if (painterLookup.status === 'error') return <RetryScreen message={painterLookup.message} onRetry={retryLookup} />;
    return <NameScreen userId={session.user.id} />;
  }
  return <Shell />;
}

/** Shown when the painter lookup failed: the user keeps their existing tag instead of being asked for a new one. */
function RetryScreen({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="form-screen">
      <div className="form">
        <div className="brand">TAGGED</div>
        <div className="sub">Could not reach the server to load your tag.</div>
        {message && <div className="err" role="alert">{message}</div>}
        <button type="button" className="btn" onClick={onRetry}>RETRY</button>
        <div className="hint">Check your connection — this retries by itself once you are back online.</div>
      </div>
    </div>
  );
}

const TABS = [['paint', 'PAINT'], ['map', 'MAP'], ['board', 'BOARD']] as const;

function Shell() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const sound = useStore((s) => s.settings.sound);
  const location = useStore((s) => s.location);
  const locationStatus = useLocation();

  useEffect(() => { sfx.enabled = sound; }, [sound]);

  // backend: realtime + periodic nearby refresh + pending flush
  useEffect(() => {
    const unsub = subscribeRealtime();
    const id = setInterval(() => {
      const l = useStore.getState().location;
      if (l) loadNearby(l.lat, l.lng).catch(() => {});
      flushPending().catch(() => {});
    }, 15000);
    const onOnline = () => { flushPending().catch(() => {}); };
    window.addEventListener('online', onOnline);
    return () => { unsub(); clearInterval(id); window.removeEventListener('online', onOnline); };
  }, []);

  // first GPS fix → pull the canvases around us
  const firstFix = !!location;
  useEffect(() => { if (location) loadNearby(location.lat, location.lng).catch(() => {}); }, [firstFix]);

  return (
    <div className="shell">
      {/* PaintScreen stays mounted (hidden) so the camera/sensor permissions and wake lock survive tab switches */}
      <PaintScreen active={tab === 'paint'} locationStatus={locationStatus} />
      {tab === 'map' && <MapScreen />}
      {tab === 'board' && <LeaderboardScreen />}
      <SettingsScreen />
      <nav className="tabs" aria-label="Tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={`tab${tab === k ? ' on' : ''}`} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
