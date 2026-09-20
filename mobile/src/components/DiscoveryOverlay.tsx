import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Discovery } from '../hooks/useDiscovery';
import { useStore } from '../store';
import { toggleUpvote, upvoteErrorMessage } from '../data/sync';
import { PixelBox } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { PressBox } from '../ui/kit';
import { haptic } from '../ui/haptics';
import { C, F, PLATE, PLATE_HI, TONES, ui, uiLabel } from '../ui/theme';

/**
 * The reveal, drawn over the camera: twinkling squares where an undiscovered piece is, once it is on
 * screen. Nothing points at it while it's off screen. The found card is rendered by the Create HUD.
 */
export function DiscoveryCues({ d }: { d: Discovery }) {
  const { width, height } = useWindowDimensions();
  const hfov = useStore((s) => s.settings.hfov);
  const pull = d.pull;
  if (!pull || d.justFound) return null;
  const onScreen = Math.abs(pull.relBearing) < hfov / 2 - 3;
  if (!onScreen) return null;
  const x = width / 2 + pull.relBearing * (width / hfov);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Shimmer x={x} y={height * 0.45} strength={1 - pull.resolve} />
    </View>
  );
}

function Shimmer({ x, y, strength }: { x: number; y: number; strength: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true); }, []);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0, 1, 2, 3, 4, 5].map((i) => <Spark key={i} i={i} x={x} y={y} t={t} strength={strength} />)}
    </View>
  );
}

function Spark({ i, x, y, t, strength }: { i: number; x: number; y: number; t: SharedValue<number>; strength: number }) {
  const ang = (i / 6) * Math.PI * 2;
  const st = useAnimatedStyle(() => {
    const ph = (t.value + i * 0.17) % 1;
    const r = 26 + 34 * ph;
    return {
      opacity: (1 - ph) * (0.35 + 0.65 * strength),
      transform: [{ translateX: x + Math.cos(ang + ph * 2) * r }, { translateY: y + Math.sin(ang + ph * 2) * r }, { scale: 0.6 + ph }],
    };
  });
  return <Animated.View style={[styles.spark, st]} />;
}

export type FoundPiece = {
  id: string;
  author_name: string;
  views: number;
  /** ISO timestamp the piece was created */
  created_at: string;
  upvotes: number;
};

/**
 * "You found a piece": drops in from the top with who made it, when, how many views and
 * upvotes it has, and a button to add your own. VIEW opens the piece page.
 *
 * The vote is optimistic — the count moves on tap and rolls back if the server refuses.
 * At a demo a button that waits on a round trip reads as broken.
 */
export function FoundCard({ c, onView }: { c: FoundPiece; onView?: () => void }) {
  const y = useSharedValue(-80);
  useEffect(() => { y.value = -80; y.value = withSpring(0, { damping: 13, stiffness: 140 }); }, [c.id]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const voted = useStore((s) => !!s.upvoted[c.id]);
  const setUpvoted = useStore((s) => s.setUpvoted);
  const [count, setCount] = useState(c.upvotes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A new card means a different piece: take its count as the truth again.
  useEffect(() => { setCount(c.upvotes); }, [c.id, c.upvotes]);

  const vote = async () => {
    if (busy) return;
    setBusy(true);
    const wasVoted = voted;
    const wasCount = count;
    setUpvoted(c.id, !wasVoted);
    setCount(Math.max(0, wasCount + (wasVoted ? -1 : 1)));
    haptic.tap();
    try {
      const res = await toggleUpvote(c.id);
      setUpvoted(c.id, res.voted);
      setCount(res.count);
    } catch (e) {
      // Put it back as it was, and say why — a vote that silently does nothing is worse
      // than one that tells you to sign in.
      setUpvoted(c.id, wasVoted);
      setCount(wasCount);
      setErr(upvoteErrorMessage(e));
      setTimeout(() => setErr(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View style={[{ alignSelf: 'stretch' }, st]}>
      <PixelBox fill={PLATE} hi={PLATE_HI} n={6} depth={5} contentStyle={styles.cardIn}>
        <PixelIcon name="star" size={24} color={C.green} alt={C.greenLo} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardEyebrow}>YOU FOUND A PIECE</Text>
          <Text style={styles.cardTitle} numberOfLines={1}>by {c.author_name}</Text>
          <Text style={[styles.cardMeta, err ? { color: C.red } : null]} numberOfLines={1}>
            {err ?? `${timeAgo(c.created_at)} · ${c.views} ${c.views === 1 ? 'view' : 'views'}`}
          </Text>
        </View>
        <PressBox
          fill={voted ? TONES.green.fill : PLATE_HI}
          hi={voted ? TONES.green.hi : PLATE_HI}
          lo={voted ? TONES.green.lo : null}
          depth={3}
          hitSlop={8}
          onPress={vote}
          contentStyle={styles.voteBtn}
        >
          <PixelIcon name="flame" size={18} color={voted ? TONES.green.text : C.white} />
          <Text style={[styles.voteText, voted && { color: TONES.green.text }]}>{count}</Text>
        </PressBox>
        {onView ? (
          <PressBox fill={TONES.white.fill} hi={TONES.white.hi} lo={TONES.white.lo} depth={3} hitSlop={8} onPress={onView} contentStyle={styles.viewBtn}>
            <Text style={styles.viewText}>VIEW</Text>
          </PressBox>
        ) : null}
      </PixelBox>
    </Animated.View>
  );
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const styles = StyleSheet.create({
  spark: { position: 'absolute', width: 9, height: 9, backgroundColor: C.white },
  cardIn: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardEyebrow: { ...uiLabel(11, 1), color: C.green },
  cardTitle: { fontFamily: F.display, fontSize: 20, color: C.white },
  cardMeta: { ...ui(12.5, '600'), color: C.dim },
  voteBtn: { height: 34, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  voteText: { ...uiLabel(12, 0.6), color: C.white },
  viewBtn: { height: 34, paddingHorizontal: 12, justifyContent: 'center' },
  viewText: { ...uiLabel(12, 0.8), color: C.ink },
});
