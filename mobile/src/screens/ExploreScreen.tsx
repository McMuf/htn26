import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Btn, Card, Chip, Header, Panel, CoinPill, Rank, Row, Screen, SheetHeader, T } from '../ui/kit';
import { Backdrop } from '../ui/Backdrop';
import { PieceImage } from '../ui/StrokeThumb';
import { C, GUTTER } from '../ui/theme';
import { useStore } from '../store';
import { fetchAllCanvases, fetchPreviewStrokes } from '../data/sync';
import { MOCK_CANVASES, isMock } from '../data/mock';
import { haversineM } from '../lib/geo';
import { timeAgo } from '../components/DiscoveryOverlay';
import { HeatMap } from '../components/HeatMap';
import { PieceDetail } from '../components/SpatialViewer';
import type { Canvas } from '../types';

type Filter = 'all' | 'fresh' | 'collab' | 'found' | 'mine';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'fresh', label: 'Fresh' }, { key: 'collab', label: 'Collab' }, { key: 'found', label: 'Found' }, { key: 'mine', label: 'Mine' },
];

/** Trending = most viewed pieces; Nearby = canvases within reach of your GPS fix; Hot zones = where the paint is. */
export function ExploreScreen() {
  const local = useStore((s) => s.canvases);
  const loc = useStore((s) => s.location);
  const discovered = useStore((s) => s.discovered);
  const me = useStore((s) => s.painter);
  const strokes = useStore((s) => s.strokes);
  const preview = useStore((s) => s.previewStrokes);
  const [remote, setRemote] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Canvas | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const load = useCallback(async () => {
    setLoading(true);
    try { const cs = await fetchAllCanvases(); setRemote(cs); fetchPreviewStrokes(cs.slice(0, 20).map((c) => c.id)).catch(() => {}); } catch {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => {
    const m = new Map<string, Canvas>();
    for (const c of remote) m.set(c.id, c);
    for (const c of Object.values(local)) m.set(c.id, { ...m.get(c.id), ...c });
    const real = [...m.values()].filter((c) => !c.flagged);
    return real.length ? real : MOCK_CANVASES; // stubs only when the wall is empty
  }, [remote, local]);
  const usingSamples = all === MOCK_CANVASES;

  const passes = useCallback((c: Canvas) => {
    if (filter === 'fresh') return Date.now() - new Date(c.updated_at).getTime() < 24 * 3600e3;
    if (filter === 'found') return !!discovered[c.id];
    if (filter === 'mine') return !!me && c.author_id === me.id;
    if (filter === 'collab') return new Set((strokes[c.id] ?? preview[c.id] ?? []).map((s) => s.author_name)).size >= 2;
    return true;
  }, [filter, discovered, me?.id, strokes, preview]);
  const shown = useMemo(() => all.filter(passes), [all, passes]);
  const trending = useMemo(() => [...shown].sort((a, b) => score(b) - score(a)).slice(0, 12), [shown]);
  const nearby = useMemo(() => {
    if (!loc) return [];
    return shown.map((c) => ({ c, d: haversineM(loc.lat, loc.lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d).slice(0, 8);
  }, [shown, loc]);

  return (
    <Screen loading={loading} onRefresh={load}>
      <Header title="EXPLORE" sub={usingSamples ? 'no pieces yet · showing sample spots' : `${all.length} walls across Waterloo`} right={<CoinPill />} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 18 }} style={styles.bleed}>
        {FILTERS.map((f) => <Chip key={f.key} label={f.label} on={filter === f.key} onPress={() => setFilter(f.key)} />)}
      </ScrollView>

      <Panel title="HOT ZONES" right={<T v="small">green = fresh paint</T>}>
        <View style={styles.mapFrame}><HeatMap canvases={all} height={240} /></View>
        <Btn label="OPEN MAP" icon="pin" tone="purple" size="sm" onPress={() => setMapOpen(true)} />
      </Panel>

      <T v="label">TRENDING PIECES</T>
      {trending.length === 0 ? <T v="sub">Nothing matches this filter yet.</T> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: 18, paddingBottom: 6 }} style={styles.bleed}>
          {trending.map((c, i) => (
            <Card key={c.id} onPress={() => setOpen(c)} style={{ width: 188 }}>
              <View>
                <PieceImage canvasId={c.id} width={172} height={124} />
                <View style={styles.rank}><Rank n={i + 1} /></View>
              </View>
              <View>
                <T v="card" numberOfLines={1}>{c.title ?? `${c.author_name}'s piece`}</T>
                <T v="small">{c.views} views · {c.stroke_count} strokes</T>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}

      <T v="label">NEARBY CANVASES</T>
      {!loc && <T v="sub">waiting for GPS…</T>}
      {nearby.map(({ c, d }) => (
        <Row key={c.id} onPress={() => setOpen(c)}
          leading={<PieceImage canvasId={c.id} width={64} height={64} cell={2} />}
          title={c.title ?? `${c.author_name}'s piece`}
          meta={`${c.author_name} · ${timeAgo(c.updated_at)} · ${c.stroke_count} strokes`}
          trailing={
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <T v="card" style={{ fontSize: 16 }}>{d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}</T>
              <T v="micro" color={discovered[c.id] ? C.greenHi : isMock(c.id) ? C.faint : C.white}>{discovered[c.id] ? 'FOUND' : isMock(c.id) ? 'SAMPLE' : 'UNDISCOVERED'}</T>
            </View>
          } />
      ))}
      {open && <PieceDetail canvas={open} onClose={() => setOpen(null)} />}
      <Modal visible={mapOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setMapOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <Backdrop />
          <View style={styles.mapTop}><SheetHeader title="HOT ZONES" sub={`${all.length} walls · tap a pin`} onClose={() => setMapOpen(false)} /></View>
          <View style={styles.mapFull}><HeatMap canvases={all} interactive /></View>
        </View>
      </Modal>
    </Screen>
  );
}

function score(c: Canvas) { const age = (Date.now() - new Date(c.updated_at).getTime()) / 3600e3; return (c.views + c.stroke_count * 2) / Math.pow(age + 2, 0.6); }

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -GUTTER, paddingHorizontal: GUTTER, flexGrow: 0 },
  rank: { position: 'absolute', left: 4, top: 4 },
  mapFrame: { borderWidth: 3, borderColor: C.ink },
  mapTop: { paddingTop: 62, paddingHorizontal: GUTTER, paddingBottom: 12 },
  mapFull: { flex: 1, borderTopWidth: 3, borderColor: C.ink },
});
