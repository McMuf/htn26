import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import type { Discovery } from '../hooks/useDiscovery';
import { useStore } from '../store';

/**
 * The reveal. A shimmer pulls your eye toward an undiscovered piece (edge arrow when it's off
 * screen, a twinkling cluster where it is when on screen), then a card slides up once it locks.
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
          <Text style={styles.pullText}>{pull.resolve < 0.05 ? '✦ something is painted near here' : pull.resolve < 1 ? `✦ a piece is resolving… ${Math.round(pull.distance)} m` : '✦ look at the wall'}</Text>
        </View>
      )}
      {d.justFound && <RevealCard c={d.justFound} onReport={onReport} />}
      {!d.justFound && d.focused && (
        <View style={styles.focusChip}>
          <Text style={styles.focusText}>{d.focused.author_name} · {d.focused.views} views · {timeAgo(d.focused.created_at)}</Text>
          <Pressable onPress={() => onReport(d.focused!.id)} hitSlop={8}><Text style={styles.report}>report</Text></Pressable>
        </View>
      )}
    </View>
  );
}

function Shimmer({ x, y, strength }: { x: number; y: number; strength: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true); }, []);
  const sparks = [0, 1, 2, 3, 4, 5];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
      {sparks.map((i) => <Spark key={i} i={i} x={x} y={y} t={t} strength={strength} />)}
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
  const st = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * t.value * strength, transform: [{ translateX: (left ? -1 : 1) * (6 + 8 * t.value) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.edge, left ? { left: 10 } : { right: 10 }, st]}>
      <Text style={styles.edgeText}>{left ? '‹' : '›'}</Text>
    </Animated.View>
  );
}

function RevealCard({ c, onReport }: { c: { id: string; author_name: string; views: number; created_at: string; stroke_count: number }; onReport: (id: string) => void }) {
  const y = useSharedValue(120);
  const glow = useSharedValue(0);
  useEffect(() => {
    y.value = withSpring(0, { damping: 14, stiffness: 120 });
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.3, { duration: 900 })), -1, true);
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], shadowOpacity: 0.5 + 0.5 * glow.value }));
  return (
    <Animated.View style={[styles.card, st]}>
      <Text style={styles.cardEyebrow}>✦ YOU FOUND A PIECE</Text>
      <Text style={styles.cardTitle}>by {c.author_name}</Text>
      <Text style={styles.cardMeta}>{timeAgo(c.created_at)} · {c.views} {c.views === 1 ? 'view' : 'views'} · {c.stroke_count} strokes</Text>
      <Pressable onPress={() => onReport(c.id)} hitSlop={8}><Text style={styles.report}>report</Text></Pressable>
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
  spark: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 1, shadowRadius: 6 },
  edge: { position: 'absolute', top: '45%', backgroundColor: '#000a', borderRadius: 24, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  edgeText: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: -4 },
  pullChip: { position: 'absolute', top: 70, alignSelf: 'center', backgroundColor: '#000a', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  pullText: { color: '#ffe600', fontWeight: '700', fontSize: 12 },
  focusChip: { position: 'absolute', bottom: 190, alignSelf: 'center', backgroundColor: '#000a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  focusText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  report: { color: '#ff5c1a', fontSize: 11, fontWeight: '700' },
  card: { position: 'absolute', bottom: 190, left: 24, right: 24, backgroundColor: '#0b0b0fee', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#ffe60088', shadowColor: '#ffe600', shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  cardEyebrow: { color: '#ffe600', fontWeight: '900', fontSize: 11, letterSpacing: 2 },
  cardTitle: { color: '#fff', fontWeight: '900', fontSize: 24, marginTop: 4 },
  cardMeta: { color: '#ffffffaa', marginTop: 4, marginBottom: 8 },
});
