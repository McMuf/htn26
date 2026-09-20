import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Avatar, Btn, Chip, Header, Panel, Pill, Rank, Row, Screen, T, Tile, Wordmark } from '../ui/kit';
import { Bands } from '../ui/Bands';
import { PixelBox } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { PieceImage } from '../ui/StrokeThumb';
import { haptic } from '../ui/haptics';
import { C, F, GUTTER, TONES, outline, ui } from '../ui/theme';
import { useStore } from '../store';
import { MOCK_ACTIVITY, MOCK_FRIENDS } from '../data/mock';
import { fetchLeaderboard } from '../data/sync';
import { CREWS, colorName, dayStats } from '../lib/economy';
import { PALETTE } from '../config';
import type { Painter } from '../types';

const CARD_W = Dimensions.get('window').width - GUTTER * 2;
const CARD_PAD = 14;
const hueOf = (name: string) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % (PALETTE.length - 1)];

/** Share card (real numbers), a live leaderboard, your crew, and sample friends. */
export function SocialScreen() {
  const painter = useStore((s) => s.painter);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const strokes = useStore((s) => s.strokes);
  const canvases = useStore((s) => s.canvases);
  const discovered = useStore((s) => s.discovered);
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [board, setBoard] = useState<Painter[]>([]);
  const [loading, setLoading] = useState(false);
  const loadBoard = useCallback(async () => { setLoading(true); try { setBoard(await fetchLeaderboard()); } catch {} setLoading(false); }, []);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  const mine = useMemo(() => Object.values(strokes).flat().filter((s) => s.author_id === painter?.id), [strokes, painter?.id]);
  const found = Object.keys(discovered).length;
  const stats = useMemo(() => dayStats(mine, painter?.id), [mine, painter?.id]);
  const topWalls = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of mine) m.set(s.canvas_id, (m.get(s.canvas_id) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [mine]);
  const topColors = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of mine) m.set(s.color, (m.get(s.color) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [mine]);
  const crew = CREWS.find((c) => c.id === settings.crew);

  const share = async () => {
    setSharing(true);
    haptic.heavy();
    const msg = `My Cospray week · ${painter?.name ?? 'anon'} · ${Math.round(painter?.paint_used ?? 0)} paint sprayed`;
    try {
      const img = await makeImageFromView(cardRef);
      if (!img) throw new Error('snapshot failed');
      const f = new File(Paths.cache, 'cospray-card.png');
      f.write(img.encodeToBytes());
      // RN's Share can't attach a file on Android
      if (Platform.OS === 'android') await Sharing.shareAsync(f.uri, { mimeType: 'image/png', dialogTitle: 'Share your Cospray card' });
      else await Share.share({ url: f.uri, message: msg });
    } catch { await Share.share({ message: `${msg} · ${found} walls found` }).catch(() => {}); }
    setSharing(false);
  };

  return (
    <Screen loading={loading} onRefresh={loadBoard}>
      <Header title="SOCIAL" right={<Pill icon="flame" value={stats.streak} />} />

      {/* the shareable card: this exact view is snapshotted to a PNG */}
      <View ref={cardRef} collapsable={false}>
        <PixelBox fill={C.tile} n={6} depth={6} contentStyle={{ padding: CARD_PAD, gap: 12, overflow: 'hidden' }}>
          <Bands width={CARD_W} height={CARD_BAND_H} top={C.purpleLo} bottom={C.tile} style={styles.band} />
          <View style={styles.cardHead}>
            <Wordmark size="sm" />
            <T v="label">MY WEEK</T>
          </View>
          <T v="eyebrow">TOP WALLS</T>
          <View style={styles.trio}>
            {[0, 1, 2].map((i) => {
              const w = topWalls[i];
              const c = w ? canvases[w[0]] : null;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={styles.thumb}>
                    {w ? <PieceImage canvasId={w[0]} width={THUMB} height={THUMB} /> : <View style={styles.thumbEmpty}><Text style={styles.q}>?</Text></View>}
                    <View style={styles.rank}><Rank n={i + 1} /></View>
                  </View>
                  <Text style={styles.cap} numberOfLines={1}>{w ? (c?.title ?? 'a wall') : 'paint more'}</Text>
                </View>
              );
            })}
          </View>
          <T v="eyebrow">ON REPEAT</T>
          <View style={styles.trio}>
            {[0, 1, 2].map((i) => {
              const col = topColors[i];
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={[styles.sq, { backgroundColor: col ? col[0] : C.well }]}>{!col && <Text style={styles.q}>?</Text>}</View>
                  <PixelBox fill={C.plate} depth={0} bw={2} n={2} contentStyle={{ paddingHorizontal: 8, paddingVertical: 3 }}><Text style={styles.timesText}>{col ? `${col[1]} times` : '—'}</Text></PixelBox>
                  <Text style={styles.cap} numberOfLines={1}>{col ? colorName(col[0]).toLowerCase() : 'no colour'}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.tiles}>
            <Tile n={painter?.strokes ?? 0} label="strokes" big />
            <Tile n={Math.round(painter?.paint_used ?? 0)} label="paint sprayed" big />
            <Tile n={found} label="walls found" big />
          </View>
          <View style={styles.foot}>
            <View>
              <Text style={styles.footName}>{painter?.name ?? 'anon'}</Text>
              <Text style={styles.footSub}>{crew ? crew.name : 'this week on the wall'}</Text>
            </View>
            <T v="micro">JOIN ME ON COSPRAY</T>
          </View>
        </PixelBox>
      </View>
      <Btn label={sharing ? '…' : 'SHARE TO STORY'} icon="share" tone="green" size="lg" disabled={sharing} onPress={share} />

      <Podium rows={board} me={painter?.id} />

      <Panel title="YOUR CREW">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <PixelIcon name="flag" size={24} color={C.green} />
          <View style={{ flex: 1 }}>
            <T v="h">{crew?.name ?? 'NO CREW YET'}</T>
            <T v="small">{crew ? crew.blurb : 'pick one to rep it on your card'} · saved on this phone</T>
          </View>
        </View>
        <View style={styles.chips}>
          {CREWS.map((c) => <Chip key={c.id} label={c.name} on={settings.crew === c.id} onPress={() => setSettings({ crew: settings.crew === c.id ? null : c.id })} />)}
        </View>
      </Panel>

      <Panel title="FRIENDS" right={<T v="label" color={C.faint}>SAMPLE DATA</T>}>
        {MOCK_FRIENDS.map((f) => (
          <Row key={f.id} leading={<Avatar name={f.name} color={f.color} size={38} />} title={f.name} meta={f.status}
            trailing={
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <T v="micro" color={f.online ? C.greenHi : C.faint}>{f.online ? 'ONLINE' : 'AWAY'}</T>
                {f.streak > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><PixelIcon name="flame" size={24} color={C.green} alt={C.greenLo} /><Text style={styles.streak}>{f.streak}</Text></View>}
              </View>
            } />
        ))}
      </Panel>
      <Panel title="ACTIVITY" right={<T v="label" color={C.faint}>SAMPLE DATA</T>}>
        {MOCK_ACTIVITY.map((a) => (
          <View key={a.id} style={styles.line}>
            <T v="small" style={{ flex: 1 }}><Text style={{ fontWeight: '700', color: C.white }}>{a.who}</Text> {a.what}</T>
            <T v="small">{a.when}</T>
          </View>
        ))}
      </Panel>
      <T v="small" style={{ textAlign: 'center' }}>friends and crews will sync once the backend supports them</T>
    </Screen>
  );
}

/** Kahoot-style podium: 1st in the middle on the tallest block, then a ranked list. Live from Supabase. */
function Podium({ rows, me }: { rows: Painter[]; me?: string }) {
  const [first, second, third] = rows;
  const col = (p: Painter | undefined, place: 1 | 2 | 3) => {
    const h = place === 1 ? 96 : place === 2 ? 68 : 52;
    const t = TONES[place === 1 ? 'green' : place === 2 ? 'white' : 'red'];
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {p ? (
          <>
            {place === 1 && <PixelIcon name="crown" size={24} color={C.green} alt={C.greenLo} />}
            <Avatar name={p.name} color={hueOf(p.name)} size={place === 1 ? 52 : 44} />
            <Text style={styles.pName} numberOfLines={1}>{p.name}</Text>
            <T v="mono">{Math.round(p.paint_used)}</T>
          </>
        ) : <T v="mono">—</T>}
        <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={4} style={{ width: '100%' }} contentStyle={{ height: h, alignItems: 'center', paddingTop: 8 }}>
          <Text style={{ fontFamily: F.display, fontSize: 28, color: t.text }}>{place}</Text>
        </PixelBox>
      </View>
    );
  };
  return (
    <Panel title="TOP PAINTERS" tone="purple" right={<T v="eyebrow">LIVE</T>}>
      {rows.length === 0 ? <T v="sub">No painters yet. Go tag something.</T> : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>{col(second, 2)}{col(first, 1)}{col(third, 3)}</View>
          {rows.slice(3, 10).map((p, i) => (
            <View key={p.id} style={[styles.line, p.id === me && { backgroundColor: C.line }]}>
              <Rank n={i + 4} />
              <T v="body" style={{ flex: 1, fontWeight: '700' }} numberOfLines={1}>{p.name}</T>
              <T v="small">{Math.round(p.paint_used)} paint</T>
            </View>
          ))}
        </>
      )}
    </Panel>
  );
}

const CARD_BAND_H = 64;
const THUMB = Math.floor((CARD_W - CARD_PAD * 2 - 24) / 3);
const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, top: 0 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 40 },
  trio: { flexDirection: 'row', gap: 12 },
  thumb: { width: THUMB, height: THUMB, borderWidth: 3, borderColor: C.ink },
  thumbEmpty: { flex: 1, backgroundColor: C.well, alignItems: 'center', justifyContent: 'center' },
  rank: { position: 'absolute', left: -3, top: -3 },
  q: { fontFamily: F.display, fontSize: 30, color: C.faint },
  cap: { ...ui(12.5, '600'), color: C.dim, maxWidth: THUMB + 12, textAlign: 'center' },
  sq: { width: THUMB, height: THUMB, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.ink },
  timesText: { ...ui(12.5, '700'), color: C.white },
  tiles: { flexDirection: 'row', gap: 8 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footName: { fontFamily: F.display, fontSize: 18, color: C.white, ...outline() },
  footSub: { ...ui(12.5, '600'), color: C.dim },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  streak: { ...ui(14, '700'), color: C.white },
  pName: { ...ui(13, '700'), color: C.white, maxWidth: 96 },
});
