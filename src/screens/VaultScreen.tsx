import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Glass } from '../ui/Glass';
import { StrokeThumb } from '../ui/StrokeThumb';
import { C, DOCK_INSET } from '../ui/theme';
import { useStore } from '../store';
import { fetchAllCanvases, fetchPreviewStrokes } from '../data/sync';
import { timeAgo } from '../components/DiscoveryOverlay';
import { isMock } from '../data/mock';
import type { Canvas } from '../types';

const W = Dimensions.get('window').width;
const CELL = (W - 18 * 2 - 12) / 2;

/** Your pieces (canvases you authored), newest first. */
export function VaultScreen() {
  const me = useStore((s) => s.painter);
  const local = useStore((s) => s.canvases);
  const setTab = useStore((s) => s.setTab);
  const [remote, setRemote] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Canvas | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const cs = await fetchAllCanvases(); setRemote(cs); fetchPreviewStrokes(cs.filter((c) => c.author_id === me?.id).map((c) => c.id)).catch(() => {}); } catch {}
    setLoading(false);
  }, [me?.id]);
  useEffect(() => { load(); }, [load]);
  const mine = useMemo(() => {
    const m = new Map<string, Canvas>();
    for (const c of remote) m.set(c.id, c);
    for (const c of Object.values(local)) m.set(c.id, { ...m.get(c.id), ...c });
    return [...m.values()].filter((c) => c.author_id && c.author_id === me?.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [remote, local, me?.id]);
  const totals = mine.reduce((a, c) => ({ views: a.views + c.views, strokes: a.strokes + c.stroke_count }), { views: 0, strokes: 0 });

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1a1206', C.bg, C.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: DOCK_INSET }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}>
        <Text style={styles.h1}>VAULT</Text>
        <Text style={styles.sub}>{mine.length} pieces · {totals.views} views · {totals.strokes} strokes</Text>
        {mine.length === 0 && (
          <Glass style={styles.empty}>
            <Text style={styles.emptyT}>Nothing saved yet.</Text>
            <Text style={styles.meta}>Every wall you spray lands here automatically.</Text>
            <Pressable onPress={() => setTab('create')} style={styles.cta}><Text style={styles.ctaText}>PAINT SOMETHING →</Text></Pressable>
          </Glass>
        )}
        <View style={styles.grid}>
          {mine.map((c) => (
            <Pressable key={c.id} onPress={() => setOpen(c)}>
              <Glass radius={18} style={{ width: CELL }}>
                <StrokeThumb canvasId={c.id} width={CELL} height={CELL * 0.8} radius={0} />
                <View style={{ padding: 10 }}>
                  <Text style={styles.title} numberOfLines={1}>{c.title ?? timeAgo(c.created_at)}</Text>
                  <Text style={styles.meta}>{c.views} views · {c.stroke_count} strokes</Text>
                </View>
              </Glass>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {open && <PieceDetail canvas={open} onClose={() => setOpen(null)} />}
    </View>
  );
}

/** Simple detail sheet: the rendered piece, where it is, and its numbers. Shared with Explore. */
export function PieceDetail({ canvas: c, onClose }: { canvas: Canvas; onClose: () => void }) {
  const strokes = useStore((s) => s.strokes[c.id] ?? s.previewStrokes[c.id] ?? []);
  const discovered = useStore((s) => s.discovered[c.id]);
  const me = useStore((s) => s.painter);
  useEffect(() => { if (!isMock(c.id)) fetchPreviewStrokes([c.id]).catch(() => {}); }, [c.id]);
  const paint = strokes.reduce((a, s) => a + s.paint_used, 0);
  const colors = [...new Set(strokes.map((s) => s.color))].slice(0, 8);
  const mapsUrl = `https://maps.apple.com/?ll=${c.lat},${c.lng}&q=${encodeURIComponent(c.title ?? 'Fresco piece')}`;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.detail}>
        <LinearGradient colors={['#160a24', C.bg]} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 40 }}>
          <View style={styles.detailHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>{c.title ?? `${c.author_name}'s piece`}</Text>
              <Text style={styles.sub}>by {c.author_name}{c.author_id === me?.id ? ' (you)' : ''} · {timeAgo(c.created_at)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}><Text style={styles.close}>Done</Text></Pressable>
          </View>
          <Glass radius={22}><StrokeThumb canvasId={c.id} width={W - 36} height={(W - 36) * 0.75} radius={0} /></Glass>
          <Glass style={styles.card}>
            <Text style={styles.label}>LOCATION</Text>
            <Text style={styles.big}>{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</Text>
            <Text style={styles.meta}>facing {Math.round(c.heading)}° · {isMock(c.id) ? 'sample spot' : c.world_map_path ? 'AR world map saved' : 'compass-anchored'}{discovered ? ' · found by you' : ''}</Text>
            <Pressable onPress={() => Linking.openURL(mapsUrl)} style={styles.cta}><Text style={styles.ctaText}>OPEN IN MAPS →</Text></Pressable>
          </Glass>
          <Glass style={styles.card}>
            <Text style={styles.label}>STATS</Text>
            <View style={styles.statRow}>
              <Stat n={c.views} l="views" /><Stat n={c.stroke_count} l="strokes" /><Stat n={Math.round(paint)} l="paint" /><Stat n={colors.length} l="colours" />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>{colors.map((col) => <View key={col} style={[styles.dot, { backgroundColor: col }]} />)}</View>
          </Glass>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return <View style={{ alignItems: 'center', flex: 1 }}><Text style={styles.statN}>{n}</Text><Text style={styles.meta}>{l}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 18, paddingTop: 66, gap: 12 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 26, letterSpacing: 3 },
  sub: { color: C.faint, fontSize: 12, marginTop: -4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  title: { color: '#fff', fontWeight: '800', fontSize: 13 },
  meta: { color: C.dim, fontSize: 11 },
  empty: { padding: 20, gap: 8, alignItems: 'center' },
  emptyT: { color: '#fff', fontWeight: '900', fontSize: 18 },
  cta: { backgroundColor: C.pink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', marginTop: 6 },
  ctaText: { color: '#fff', fontWeight: '900', letterSpacing: 2, fontSize: 12 },
  detail: { flex: 1, backgroundColor: C.bg, paddingTop: 10 },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  close: { color: C.cyan, fontWeight: '800', fontSize: 16 },
  card: { padding: 16, gap: 10 },
  label: { color: C.yellow, fontWeight: '800', letterSpacing: 2, fontSize: 11 },
  big: { color: '#fff', fontWeight: '800', fontSize: 18 },
  statRow: { flexDirection: 'row' },
  statN: { color: '#fff', fontWeight: '900', fontSize: 24 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#fff6' },
});
