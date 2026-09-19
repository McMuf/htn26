import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { PAINT_MAX, SHAKE_MIN_TO_SPRAY } from '../config';
import { useStore, type Side } from '../store';
import type { Blocker } from '../hooks/useSprayEngine';

export function Reticle({ spraying }: { spraying: boolean }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = spraying
      ? withRepeat(withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 90 })), -1, true)
      : withTiming(1, { duration: 150 });
  }, [spraying]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View pointerEvents="none" style={styles.reticleWrap}>
      <Animated.View style={[styles.reticle, spraying && styles.reticleOn, st]}>
        <View style={styles.reticleDot} />
      </Animated.View>
    </View>
  );
}

export function PaintMeters() {
  const paint = useStore((s) => s.paint);
  const settings = useStore((s) => s.settings);
  return (
    <View style={styles.meters} pointerEvents="none">
      <Meter side="A" label="VOL +" color={settings.optionA.color} value={paint.A} cap={settings.optionA.cap} />
      <Meter side="B" label="VOL −" color={settings.optionB.color} value={paint.B} cap={settings.optionB.cap} />
    </View>
  );
}

function Meter({ label, color, value, cap }: { side: Side; label: string; color: string; value: number; cap: string }) {
  const frac = value / PAINT_MAX;
  return (
    <View style={styles.meter}>
      <View style={styles.meterBarBg}>
        <View style={[styles.meterBar, { height: `${Math.max(2, frac * 100)}%`, backgroundColor: color, opacity: frac < 0.15 ? 0.5 : 1 }]} />
      </View>
      <Text style={styles.meterLabel}>{label}</Text>
      <Text style={[styles.meterSub, { color }]}>{cap}</Text>
      <Text style={styles.meterPct}>{Math.round(frac * 100)}%</Text>
    </View>
  );
}

export function CanMeter() {
  const shake = useStore((s) => s.shake);
  const low = shake < SHAKE_MIN_TO_SPRAY;
  const wob = useSharedValue(0);
  useEffect(() => {
    wob.value = low ? withRepeat(withSequence(withTiming(-8, { duration: 120, easing: Easing.inOut(Easing.quad) }), withTiming(8, { duration: 120 })), -1, true) : withTiming(0, { duration: 120 });
  }, [low]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${wob.value}deg` }] }));
  return (
    <View style={styles.can} pointerEvents="none">
      <Animated.View style={[styles.canBody, st]}>
        <View style={styles.canNozzle} />
        <View style={styles.canFillBg}>
          <View style={[styles.canFill, { height: `${Math.round(shake * 100)}%`, backgroundColor: low ? '#ff5c1a' : '#7cff3a' }]} />
        </View>
      </Animated.View>
      <Text style={[styles.canLabel, low && { color: '#ff5c1a' }]}>{low ? 'SHAKE CAN' : `charge ${Math.round(shake * 100)}%`}</Text>
    </View>
  );
}

export function BlockerBanner({ blocker }: { blocker: Blocker }) {
  if (!blocker) return null;
  const msg = {
    'no-location': 'Waiting for GPS…',
    'outside-geofence': 'Outside Waterloo Region — paint zone',
    shake: 'Shake the can first!',
    empty: 'Out of paint — wait for it to refill',
  }[blocker];
  return (
    <View style={styles.banner} pointerEvents="none">
      <Text style={styles.bannerText}>{msg}</Text>
    </View>
  );
}

export function HoldButtons({ onStart, onEnd }: { onStart: (s: Side) => void; onEnd: (s: Side) => void }) {
  const settings = useStore((s) => s.settings);
  const paint = useStore((s) => s.paint);
  return (
    <View style={styles.holdRow}>
      {(['A', 'B'] as Side[]).map((side) => {
        const opt = side === 'A' ? settings.optionA : settings.optionB;
        const frac = paint[side] / PAINT_MAX;
        return (
          <Pressable key={side} onPressIn={() => onStart(side)} onPressOut={() => onEnd(side)}
            style={({ pressed }) => [styles.holdBtn, { borderColor: opt.color, backgroundColor: pressed ? opt.color + 'dd' : '#000a', transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <View style={[styles.holdFill, { backgroundColor: opt.color + '55', width: `${Math.round(frac * 100)}%` }]} />
            <View style={[styles.holdDot, { backgroundColor: opt.color }]} />
            <View>
              <Text style={styles.holdText}>HOLD · {side === 'A' ? 'VOL+' : 'VOL−'}</Text>
              <Text style={styles.holdSub}>{opt.cap} cap · {Math.round(frac * 100)}%</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  reticleWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#ffffff88', alignItems: 'center', justifyContent: 'center' },
  reticleOn: { borderColor: '#ffffffee', borderStyle: 'dashed' },
  reticleDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' },
  meters: { position: 'absolute', right: 12, top: 110, flexDirection: 'row', gap: 10 },
  meter: { alignItems: 'center', width: 44 },
  meterBarBg: { width: 14, height: 120, borderRadius: 7, backgroundColor: '#ffffff22', justifyContent: 'flex-end', overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff33' },
  meterBar: { width: '100%', borderRadius: 7 },
  meterLabel: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 },
  meterSub: { fontSize: 9, fontWeight: '700' },
  meterPct: { color: '#ffffffaa', fontSize: 9 },
  can: { position: 'absolute', left: 14, top: 110, alignItems: 'center' },
  canBody: { alignItems: 'center' },
  canNozzle: { width: 10, height: 10, backgroundColor: '#ddd', borderRadius: 2, marginBottom: 2 },
  canFillBg: { width: 28, height: 90, borderRadius: 8, backgroundColor: '#ffffff22', borderWidth: 1, borderColor: '#ffffff44', justifyContent: 'flex-end', overflow: 'hidden' },
  canFill: { width: '100%' },
  canLabel: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 6 },
  banner: { position: 'absolute', top: '58%', alignSelf: 'center', backgroundColor: '#000a', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  bannerText: { color: '#fff', fontWeight: '700' },
  holdRow: { position: 'absolute', bottom: 112, left: 16, right: 16, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  holdBtn: { flex: 1, height: 72, borderRadius: 36, borderWidth: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' },
  holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  holdDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  holdText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1 },
  holdSub: { color: '#ffffffcc', fontSize: 11, fontWeight: '700' },
});
