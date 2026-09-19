import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Discovery } from '../hooks/useDiscovery';
import { useStore } from '../store';
import { PixelBox } from '../ui/PixelBox';
import { PixelIcon } from '../ui/PixelIcon';
import { C, F, HOLD_TOP } from '../ui/theme';

const PLATE = '#120a2e';
const PLATE_HI = '#2a1c5c';

/**
 * The reveal. A pixel shimmer pulls your eye toward an undiscovered piece (edge arrow when it's off
 * screen, twinkling squares where it is when on screen), then a card slides up once it locks.
 */
export function DiscoveryOverlay({ d, onReport }: { d: Discovery; onReport: (id: string) => void }) {
  const { width, height } = useWindowDimensions();
  const hfov = useStore((s) => s.settings.hfov);
  const pxPerDeg = width / hfov;
  const pull = d.pull;
  const onScreen = pull && Math.abs(pull.relBearing) < hfov / 2 - 3;
  const x = pull ? width / 2 + pull.relBearing * pxPerDeg : 0;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {pull && !d.justFound && (
        onScreen ? <Shimmer x={x} y={height * 0.45} strength={1 - pull.resolve} /> : <EdgeArrow left={pull.relBearing < 0} strength={1 - pull.resolve * 0.5} />
      )}
      {pull && !d.justFound && (
        <View style={styles.pullChip} pointerEvents="none">
          <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ paddingHorizontal: 12, height: 34, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <PixelIcon name="star" size={24} color="#fff" />
            <Text style={styles.pullText}>{pull.resolve < 0.05 ? 'SOMETHING IS PAINTED NEAR HERE' : pull.resolve < 1 ? `A PIECE IS RESOLVING · ${Math.round(pull.distance)} M` : 'LOOK AT THE WALL'}</Text>
          </PixelBox>
        </View>
      )}
      {d.justFound && <RevealCard c={d.justFound} onReport={onReport} />}
      {!d.justFound && d.focused && (
        <View style={styles.focusChip}>
          <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ paddingHorizontal: 12, height: 38, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={styles.focusText}>{d.focused.author_name} · {d.focused.views} views · {timeAgo(d.focused.created_at)}</Text>
            <Pressable onPress={() => onReport(d.focused!.id)} hitSlop={8}><Text style={styles.report}>REPORT</Text></Pressable>
          </PixelBox>
        </View>
      )}
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

function EdgeArrow({ left, strength }: { left: boolean; strength: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0, { duration: 500 })), -1, true); }, []);
  const st = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * t.value * strength, transform: [{ translateX: (left ? -1 : 1) * (4 + 8 * t.value) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.edge, left ? { left: 10 } : { right: 10 }, st]}>
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={3} style={{ width: 48 }} contentStyle={{ height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <PixelIcon name={left ? 'left' : 'right'} size={24} color="#fff" />
      </PixelBox>
    </Animated.View>
  );
}

function RevealCard({ c, onReport }: { c: { id: string; author_name: string; views: number; created_at: string; stroke_count: number }; onReport: (id: string) => void }) {
  const y = useSharedValue(140);
  useEffect(() => { y.value = withSpring(0, { damping: 13, stiffness: 130 }); }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.card, st]}>
      <PixelBox fill={PLATE} hi={PLATE_HI} n={6} depth={5} contentStyle={{ padding: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PixelIcon name="star" size={24} color="#fff" />
          <Text style={styles.cardEyebrow}>YOU FOUND A PIECE</Text>
        </View>
        <Text style={styles.cardTitle}>by {c.author_name}</Text>
        <Text style={styles.cardMeta}>{timeAgo(c.created_at)} · {c.views} {c.views === 1 ? 'view' : 'views'} · {c.stroke_count} strokes</Text>
        <Pressable onPress={() => onReport(c.id)} hitSlop={8}><Text style={styles.report}>REPORT</Text></Pressable>
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
  spark: { position: 'absolute', width: 9, height: 9, backgroundColor: '#fff' },
  edge: { position: 'absolute', top: '45%' },
  pullChip: { position: 'absolute', top: 112, alignSelf: 'center' },
  pullText: { fontFamily: F.labelBold, fontSize: 9, color: '#fff', letterSpacing: 0.8 },
  focusChip: { position: 'absolute', bottom: HOLD_TOP + 8, alignSelf: 'center' },
  focusText: { fontFamily: F.body, fontSize: 13, color: '#fff' },
  report: { fontFamily: F.labelBold, fontSize: 9, color: C.dim, letterSpacing: 1 },
  card: { position: 'absolute', bottom: HOLD_TOP + 8, left: 24, right: 24 },
  cardEyebrow: { fontFamily: F.labelBold, fontSize: 10, color: '#fff', letterSpacing: 1.5 },
  cardTitle: { fontFamily: F.display, fontSize: 26, color: '#fff' },
  cardMeta: { fontFamily: F.body, fontSize: 13, color: C.dim, marginBottom: 6 },
});
