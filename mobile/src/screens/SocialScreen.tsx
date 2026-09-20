import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { makeImageFromView } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Avatar, Btn, Chip, Header, Panel, CoinPill, Rank, Row, Screen, T, Tile, Wordmark } from '../ui/kit';
import { Bands } from '../ui/Bands';
import { PixelBox } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { PieceImage } from '../ui/StrokeThumb';
import { haptic } from '../ui/haptics';
import { C, F, GUTTER, TONES, outline, ui } from '../ui/theme';
import { useStore } from '../store';
import { fetchTopPieces, toggleUpvote, upvoteErrorMessage, type TopPiece } from '../data/sync';
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
  const [board, setBoard] = useState<TopPiece[]>([]);
  const [loading, setLoading] = useState(false);
  const loadBoard = useCallback(async () => { setLoading(true); try { setBoard(await fetchTopPieces(20)); } catch {} setLoading(false); }, []);
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
      <Header title="SOCIAL" right={<CoinPill />} />

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

      <Podium rows={board} me={painter?.id} onVoted={loadBoard} />

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

    </Screen>
  );
}

/** Kahoot-style podium: 1st in the middle on the tallest block, then a ranked list. Live from Supabase. */
/**
 * The board: the twenty most-upvoted pieces. Replaces the old painters-by-paint ranking —
 * the thing being ranked is now the art, not the artist.
 *
 * Votes are optimistic here too: the row's count moves on tap, and the whole board is
 * refetched afterwards so the ordering settles to whatever the server says.
 */
function Podium({ rows, me, onVoted }: { rows: TopPiece[]; me?: string; onVoted?: () => void }) {
  const [first, second, third] = rows;
  const pieceName = (p: TopPiece) => p.title?.trim() || `${p.author_name}'s piece`;

  const col = (p: TopPiece | undefined, place: 1 | 2 | 3) => {
    const h = place === 1 ? 96 : place === 2 ? 68 : 52;
    const t = TONES[place === 1 ? 'green' : place === 2 ? 'white' : 'red'];
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {p ? (
          <>
            {place === 1 && <PixelIcon name="crown" size={24} color={C.green} alt={C.greenLo} />}
            <Avatar name={p.author_name} color={hueOf(p.author_name)} size={place === 1 ? 52 : 44} />
            <Text style={styles.pName} numberOfLines={1}>{pieceName(p)}</Text>
            <T v="mono">{p.upvotes}</T>
          </>
        ) : <T v="mono">—</T>}
        <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={4} style={{ width: '100%' }} contentStyle={{ height: h, alignItems: 'center', paddingTop: 8 }}>
          <Text style={{ fontFamily: F.display, fontSize: 28, color: t.text }}>{place}</Text>
        </PixelBox>
      </View>
    );
  };

  return (
    <Panel title="TOP PIECES" right={<T v="eyebrow">LIVE</T>}>
      {rows.length === 0 ? <T v="sub">Nothing on the wall yet. Go tag something.</T> : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>{col(second, 2)}{col(first, 1)}{col(third, 3)}</View>
          {rows.slice(3, 20).map((p, i) => (
            <View key={p.id} style={[styles.line, p.author_id === me && { backgroundColor: C.line }]}>
              <Rank n={i + 4} />
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: '700' }} numberOfLines={1}>{pieceName(p)}</T>
                <T v="small" numberOfLines={1}>by {p.author_name}</T>
              </View>
              <VoteButton piece={p} onVoted={onVoted} />
            </View>
          ))}
        </>
      )}
    </Panel>
  );
}

/** The vote control on a board row: optimistic, and reconciled from the server's count. */
function VoteButton({ piece, onVoted }: { piece: TopPiece; onVoted?: () => void }) {
  const voted = useStore((s) => !!s.upvoted[piece.id]);
  const setUpvoted = useStore((s) => s.setUpvoted);
  const [count, setCount] = useState(piece.upvotes);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCount(piece.upvotes); }, [piece.id, piece.upvotes]);

  const press = async () => {
    if (busy) return;
    setBusy(true);
    const wasVoted = voted;
    const wasCount = count;
    setUpvoted(piece.id, !wasVoted);
    setCount(Math.max(0, wasCount + (wasVoted ? -1 : 1)));
    haptic.tap();
    try {
      const res = await toggleUpvote(piece.id);
      setUpvoted(piece.id, res.voted);
      setCount(res.count);
      onVoted?.();
    } catch (e) {
      setUpvoted(piece.id, wasVoted);
      setCount(wasCount);
      Alert.alert('Could not vote', upvoteErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Btn label={String(count)} icon="flame" tone={voted ? 'green' : 'tile'} size="sm" onPress={press} />
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
