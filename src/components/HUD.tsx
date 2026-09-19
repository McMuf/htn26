import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { PAINT_MAX, SHAKE_MIN_TO_SPRAY } from '../config';
import { useStore, type Side } from '../store';
import type { Blocker } from '../hooks/useSprayEngine';
import { PixelBox } from '../ui/PixelBox';
import { PixelCan } from '../ui/PixelCan';
import { IconBtn } from '../ui/kit';
import { C, F, HOLD_BOTTOM, HOLD_H, HOLD_TOP } from '../ui/theme';
import { OPACITY, THICKNESS, skinColor } from '../lib/economy';

/** Everything drawn over the camera is deliberately colourless: dark plates, white text, no coloured borders or dots.
 *  The only colour on screen is paint itself (fills of the meters and hold buttons). */
const PLATE = '#120a2e';
const PLATE_HI = '#2a1c5c';

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
      <Animated.View style={[styles.reticle, spraying && styles.reticleOn, st]}><View style={styles.reticleDot} /></Animated.View>
    </View>
  );
}

/** Top bar shared by both Create screens. */
export function TopBar({ status, toolsOn, onTools, onSettings }: { status: string; toolsOn: boolean; onTools: () => void; onSettings: () => void }) {
  return (
    <View style={styles.topBar} pointerEvents="box-none">
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ height: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text style={styles.brand}>FRESCO</Text>
      </PixelBox>
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} style={{ flex: 1 }} contentStyle={{ height: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
        <Text style={styles.status} numberOfLines={1}>{status}</Text>
      </PixelBox>
      <IconBtn icon="sliders" active={toolsOn} onPress={onTools} />
      <IconBtn icon="settings" onPress={onSettings} />
    </View>
  );
}

function VMeter({ value, color }: { value: number; color: string }) {
  const segs = 10, lit = Math.round(Math.max(0, Math.min(1, value)) * segs);
  return (
    <View style={styles.vbar}>
      {Array.from({ length: segs }, (_, i) => (
        <View key={i} style={{ height: 9, backgroundColor: segs - 1 - i < lit ? color : '#ffffff18' }} />
      ))}
    </View>
  );
}

export function PaintMeters() {
  const paint = useStore((s) => s.paint);
  const settings = useStore((s) => s.settings);
  return (
    <View style={styles.meters} pointerEvents="none">
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ padding: 8, flexDirection: 'row', gap: 10 }}>
        {(['A', 'B'] as Side[]).map((side) => {
          const opt = side === 'A' ? settings.optionA : settings.optionB;
          const frac = paint[side] / PAINT_MAX;
          return (
            <View key={side} style={{ alignItems: 'center', gap: 4 }}>
              <VMeter value={frac} color={opt.color} />
              <Text style={styles.mLabel}>{side === 'A' ? 'VOL+' : 'VOL−'}</Text>
              <Text style={styles.mSub}>{opt.cap.toUpperCase()}</Text>
              <Text style={styles.mPct}>{Math.round(frac * 100)}%</Text>
            </View>
          );
        })}
      </PixelBox>
    </View>
  );
}

export function CanMeter() {
  const shake = useStore((s) => s.shake);
  const settings = useStore((s) => s.settings);
  const low = shake < SHAKE_MIN_TO_SPRAY;
  return (
    <View style={styles.can} pointerEvents="none">
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ padding: 8, alignItems: 'center', gap: 6 }}>
        <PixelCan color={skinColor(settings.canSkin, settings.optionA.color)} level={shake} cell={3} wobble={low} />
        <Text style={styles.mLabel}>{low ? 'SHAKE!' : `${Math.round(shake * 100)}%`}</Text>
      </PixelBox>
    </View>
  );
}

export function BlockerBanner({ blocker }: { blocker: Blocker }) {
  if (!blocker) return null;
  const msg = {
    'no-location': 'WAITING FOR GPS',
    'outside-geofence': 'OUTSIDE THE WATERLOO PAINT ZONE',
    shake: 'SHAKE THE CAN FIRST',
    empty: 'OUT OF PAINT · REFILLING',
  }[blocker];
  return (
    <View style={styles.banner} pointerEvents="none">
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ paddingHorizontal: 16, height: 40, justifyContent: 'center' }}>
        <Text style={styles.bannerText}>{msg}</Text>
      </PixelBox>
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
          <Pressable key={side} style={{ flex: 1 }} onPressIn={() => onStart(side)} onPressOut={() => onEnd(side)}>
            {({ pressed }) => (
              <PixelBox fill={pressed ? '#3a2a78' : PLATE} hi={pressed ? '#5a44a8' : PLATE_HI} depth={pressed ? 1 : 5} style={{ marginTop: pressed ? 4 : 0 }} n={3}
                contentStyle={{ height: HOLD_H, justifyContent: 'center', paddingHorizontal: 14 }}>
                <View style={styles.holdFillWrap} pointerEvents="none"><View style={{ width: `${Math.round(frac * 100)}%`, height: '100%', backgroundColor: opt.color, opacity: 0.4 }} /></View>
                <Text style={styles.holdText}>HOLD · {side === 'A' ? 'VOL+' : 'VOL−'}</Text>
                <Text style={styles.holdSub}>{opt.cap.toUpperCase()} CAP · {Math.round(frac * 100)}%</Text>
              </PixelBox>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Size + opacity steppers (the spec's in-camera line thickness and paint opacity). */
export function ToolsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const row = (label: string, items: { label: string }[], value: number, key: 'thickness' | 'opacity') => (
    <View style={{ gap: 5 }}>
      <Text style={styles.mLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {items.map((it, i) => (
          <Pressable key={it.label} onPress={() => setSettings({ [key]: i })}>
            <PixelBox fill={value === i ? '#ffd21f' : '#1f1348'} hi={value === i ? '#fff07a' : null} depth={2} n={3} style={{ width: 42 }} contentStyle={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[styles.segText, value === i && { color: '#2a1a00' }]}>{it.label}</Text>
            </PixelBox>
          </Pressable>
        ))}
      </View>
    </View>
  );
  return (
    <View style={styles.tools}>
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ padding: 10, gap: 10 }}>
        {row('SIZE', THICKNESS, settings.thickness, 'thickness')}
        {row('OPACITY %', OPACITY, settings.opacity, 'opacity')}
      </PixelBox>
    </View>
  );
}

/** Focus (close to the wall) or mist (stepping back), from the live ARKit hit distance. */
export function DistanceChip({ meters, hit }: { meters: number; hit: boolean }) {
  const mode = !hit ? '—' : meters < 0.8 ? 'FOCUS' : meters > 1.5 ? 'MIST' : 'MID';
  return (
    <View style={styles.dist} pointerEvents="none">
      <PixelBox fill={PLATE} hi={PLATE_HI} depth={4} contentStyle={{ paddingHorizontal: 12, height: 36, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={styles.mLabel}>{mode}</Text>
        <Text style={styles.mSub}>{hit ? `${meters.toFixed(1)} M` : 'NO SURFACE'}</Text>
      </PixelBox>
    </View>
  );
}

const styles = StyleSheet.create({
  reticleWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#ffffff99', alignItems: 'center', justifyContent: 'center' },
  reticleOn: { borderColor: '#ffffff', borderStyle: 'dashed' },
  reticleDot: { width: 4, height: 4, backgroundColor: '#fff' },
  topBar: { position: 'absolute', top: 56, left: 14, right: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  brand: { fontFamily: F.display, fontSize: 18, color: '#fff', letterSpacing: 1 },
  status: { fontFamily: F.labelBold, fontSize: 9, color: C.dim, letterSpacing: 0.8 },
  meters: { position: 'absolute', right: 14, top: 122 },
  vbar: { backgroundColor: '#0a0620', padding: 2, gap: 2, width: 22 },
  mLabel: { fontFamily: F.labelBold, fontSize: 9, color: '#fff', letterSpacing: 1 },
  mSub: { fontFamily: F.label, fontSize: 8, color: C.dim },
  mPct: { fontFamily: F.mono, fontSize: 17, color: '#fff' },
  can: { position: 'absolute', left: 14, top: 122 },
  banner: { position: 'absolute', top: '56%', alignSelf: 'center' },
  bannerText: { fontFamily: F.labelBold, fontSize: 10, color: '#fff', letterSpacing: 1 },
  holdRow: { position: 'absolute', bottom: HOLD_BOTTOM, left: 14, right: 14, flexDirection: 'row', gap: 12 },
  holdFillWrap: { position: 'absolute', left: 3, top: 3, bottom: 3, right: 3 },
  holdText: { fontFamily: F.display, fontSize: 18, color: '#fff' },
  holdSub: { fontFamily: F.labelBold, fontSize: 8, color: C.dim, letterSpacing: 0.8, marginTop: 2 },
  tools: { position: 'absolute', right: 14, bottom: HOLD_TOP + 50 },
  segText: { fontFamily: F.display, fontSize: 14, color: '#fff' },
  dist: { position: 'absolute', top: '30%', alignSelf: 'center' },
});
