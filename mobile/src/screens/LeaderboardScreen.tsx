import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { fetchLeaderboard } from '../data/sync';
import { useStore } from '../store';
import type { Painter } from '../types';

export function LeaderboardScreen() {
  const me = useStore((s) => s.painter);
  const [rows, setRows] = useState<Painter[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await fetchLeaderboard()); setErr(null); } catch (e: any) { setErr(e?.message ?? 'offline'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, [load]);
  const data = rows.length ? rows : me ? [me] : [];
  return (
    <View style={styles.root}>
      <Text style={styles.h1}>TOP PAINTERS</Text>
      {err && <Text style={styles.err}>Leaderboard offline ({err}) — showing you only</Text>}
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
        renderItem={({ item, index }) => (
          <View style={[styles.row, me?.name === item.name && styles.rowMe]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.stat}>{Math.round(item.paint_used)} paint</Text>
            <Text style={styles.stat}>{item.strokes} strokes</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No painters yet. Go tag something.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f', paddingTop: 64, paddingHorizontal: 16 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 22, letterSpacing: 3, marginBottom: 12 },
  err: { color: '#ff5c1a', fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#ffffff11', gap: 12 },
  rowMe: { backgroundColor: '#ff2d9522', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  rank: { color: '#ffe600', fontWeight: '900', width: 28, fontSize: 16 },
  name: { color: '#fff', fontWeight: '800', flex: 1, fontSize: 16 },
  stat: { color: '#ffffffaa', fontSize: 12 },
  empty: { color: '#ffffff88', marginTop: 40, textAlign: 'center' },
});
