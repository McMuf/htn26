import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Glass } from '../ui/Glass';
import { StrokeThumb } from '../ui/StrokeThumb';
import { C, DOCK_INSET } from '../ui/theme';
import { useStore } from '../store';
import { fetchAllCanvases, fetchPreviewStrokes } from '../data/sync';
import { MOCK_CANVASES, isMock } from '../data/mock';
import { haversineM } from '../lib/geo';
import { timeAgo } from '../components/DiscoveryOverlay';
import type { Canvas } from '../types';
import { PieceDetail } from './VaultScreen';

/** Trending = most viewed pieces on the backend; Nearby = canvases within reach of your GPS fix. */
export function ExploreScreen() {
  const local = useStore((s) => s.canvases);
  const loc = useStore((s) => s.location);
  const discovered = useStore((s) => s.discovered);
  const [remote, setRemote] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Canvas | null>(null);
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
  const trending = useMemo(() => [...all].sort((a, b) => score(b) - score(a)).slice(0, 12), [all]);
  const nearby = useMemo(() => {
    if (!loc) return [];
    return all.map((c) => ({ c, d: haversineM(loc.lat, loc.lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d).slice(0, 8);
  }, [all, loc]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#08141c', C.bg, C.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: DOCK_INSET }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}>
        <Text style={styles.h1}>EXPLORE</Text>
        <Text style={styles.sub}>{all === MOCK_CANVASES ? 'no pieces on the wall yet — showing sample spots' : `${all.length} pieces across Waterloo`}</Text>

        <Text style={styles.label}>TRENDING FRESCOS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 18 }} style={{ marginHorizontal: -18, paddingHorizontal: 18 }}>
          {trending.map((c, i) => (
            <Pressable key={c.id} onPress={() => setOpen(c)}>
              <Glass radius={20} style={styles.trendCard}>
                <StrokeThumb canvasId={c.id} width={168} height={120} radius={0} />
                <View style={styles.trendMeta}>
                  <Text style={styles.rank}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>{c.title ?? `${c.author_name}'s piece`}</Text>
                    <Text style={styles.meta}>{c.views} views · {c.stroke_count} strokes</Text>
                  </View>
                </View>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.label, { marginTop: 8 }]}>NEARBY CANVASES</Text>
        {!loc && <Text style={styles.sub}>waiting for GPS…</Text>}
        {nearby.map(({ c, d }) => (
          <Pressable key={c.id} onPress={() => setOpen(c)}>
            <Glass radius={18} style={styles.row}>
              <StrokeThumb canvasId={c.id} width={64} height={64} radius={12} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{c.title ?? `${c.author_name}'s piece`}</Text>
                <Text style={styles.meta}>{c.author_name} · {timeAgo(c.updated_at)} · {c.stroke_count} strokes</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.dist}>{d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}</Text>
                <Text style={[styles.meta, { color: discovered[c.id] ? C.lime : isMock(c.id) ? C.faint : C.pink }]}>{discovered[c.id] ? 'found' : isMock(c.id) ? 'sample' : 'undiscovered'}</Text>
              </View>
            </Glass>
          </Pressable>
        ))}
      </ScrollView>
      {open && <PieceDetail canvas={open} onClose={() => setOpen(null)} />}
    </View>
  );
}

function score(c: Canvas) { const age = (Date.now() - new Date(c.updated_at).getTime()) / 3600e3; return (c.views + c.stroke_count * 2) / Math.pow(age + 2, 0.6); }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 18, paddingTop: 66, gap: 12 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 28, letterSpacing: 4 },
  sub: { color: C.faint, fontSize: 12, marginTop: -6 },
  label: { color: C.yellow, fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  trendCard: { width: 168 },
  trendMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  rank: { color: C.yellow, fontWeight: '900', fontSize: 14 },
  title: { color: '#fff', fontWeight: '800', fontSize: 14 },
  meta: { color: C.dim, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  dist: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
