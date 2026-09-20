import React, { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Backdrop } from './Backdrop';
import { PixelBox } from './PixelBox';
import { PixelIcon, type IconName } from './PixelIcon';
import { haptic } from './haptics';
import { useStore } from '../store';
import { coinsOf } from '../lib/economy';
import { BACKDROPS, C, DOCK_INSET, F, GUTTER, PLATE_HI, outline, TONES, ui, uiLabel, type BackdropName, type Tone } from './theme';

/** Kept for old call sites; prefer `haptic.tap`. */
export const hapticTap = haptic.tap;

// ---- text ---------------------------------------------------------------------------------
type V = 'title' | 'h' | 'card' | 'sub' | 'body' | 'small' | 'label' | 'eyebrow' | 'micro' | 'num' | 'numBig' | 'mono';
const TEXT: Record<V, TextStyle> = {
  title: { fontFamily: F.display, fontSize: 32, letterSpacing: 1, color: C.white, ...outline() },
  h: { fontFamily: F.display, fontSize: 20, color: C.white, ...outline() },
  card: { fontFamily: F.display, fontSize: 17, color: C.white },
  sub: { ...ui(14, '500'), color: C.dim },
  body: { ...ui(15, '500'), color: C.white },
  small: { ...ui(13, '500'), color: C.dim },
  label: { ...uiLabel(11.5, 1.1), color: C.green },
  eyebrow: { ...uiLabel(11.5, 1.1), color: C.white },
  micro: { ...uiLabel(10.5, 0.6), color: C.dim },
  num: { fontFamily: F.display, fontSize: 30, color: C.white, ...outline() },
  numBig: { fontFamily: F.display, fontSize: 34, color: C.white, ...outline() },
  mono: { fontFamily: F.display, fontSize: 20, letterSpacing: 0.5, color: C.greenHi },
};
export function T({ v = 'body', color, style, ...rest }: TextProps & { v?: V; color?: string }) {
  return <Text {...rest} style={[TEXT[v], color ? { color } : null, style]} />;
}

/** The COSPRAY wordmark: arcade face (Press Start 2P) with a stacked hard shadow (green -> purple -> ink). */
export function Wordmark({ size = 'lg', style }: { size?: 'lg' | 'sm'; style?: StyleProp<TextStyle> }) {
  const lg = size === 'lg';
  const fs = lg ? 34 : 14, ls = lg ? 2 : 1, px = lg ? 3 : 2;
  const base: TextStyle = { fontFamily: F.arcade, fontSize: fs, letterSpacing: ls, color: C.white, includeFontPadding: false };
  return (
    <View style={style}>
      <Text style={[base, styles.abs, { top: px * 3, color: C.ink }]}>COSPRAY</Text>
      <Text style={[base, styles.abs, { top: px * 2, color: C.purpleLo }]}>COSPRAY</Text>
      <Text style={[base, styles.abs, { top: px, color: C.greenLo }]}>COSPRAY</Text>
      <Text style={base}>COSPRAY</Text>
    </View>
  );
}

// ---- screen scaffolding ---------------------------------------------------------------------
export function Screen({ tone = 'purple', children, scroll = true, loading, onRefresh, contentStyle, sheet }: {
  tone?: BackdropName; children?: React.ReactNode; scroll?: boolean; loading?: boolean; onRefresh?: () => void; contentStyle?: StyleProp<ViewStyle>;
  /** Presented as a page sheet (Market, Settings): no status bar or dock to clear. */
  sheet?: boolean;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: BACKDROPS[tone].bottom }}>
      <Backdrop tone={tone} />
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, sheet && styles.sheetScroll, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={C.white} /> : undefined}>
          {children}
        </ScrollView>
      ) : children}
    </View>
  );
}

export function Header({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <T v="title">{title}</T>
        {sub ? <T v="sub" style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** Title strip + close key for anything presented as a sheet or full-screen modal. */
export function SheetHeader({ title, sub, onClose, right }: { title: string; sub?: string; onClose: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <T v="title" numberOfLines={1}>{title}</T>
        {sub ? <T v="sub" style={{ marginTop: 2 }} numberOfLines={1}>{sub}</T> : null}
      </View>
      {right}
      <IconBtn icon="x" onPress={onClose} />
    </View>
  );
}

/** Panel with a big pixel title strip, like the Subway Surfers mission cards. */
export function Panel({ title, tone = 'panel', right, children, style, pad = 14 }: {
  title?: string; tone?: Tone; right?: React.ReactNode; children?: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number;
}) {
  const t = TONES[tone];
  return (
    <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} n={6} depth={5} style={style} contentStyle={{ padding: pad, gap: 12 }}>
      {title ? (
        <View style={styles.panelHead}>
          <T v="label" color={tone === 'green' ? C.greenInk : C.green}>{title}</T>
          {right}
        </View>
      ) : null}
      {children}
    </PixelBox>
  );
}

/** Empty state: icon, headline, hint and an optional action, on the default panel. */
export function Empty({ icon, title, sub, action }: { icon: IconName; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <Panel>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 10 }}>
        <PixelIcon name={icon} size={48} color={C.green} alt={C.greenLo} />
        <T v="h" style={{ textAlign: 'center' }}>{title}</T>
        {sub ? <T v="sub" style={{ textAlign: 'center' }}>{sub}</T> : null}
        {action ? <View style={{ marginTop: 6 }}>{action}</View> : null}
      </View>
    </Panel>
  );
}

// ---- the one press primitive ---------------------------------------------------------------------
/**
 * A pressable slab: the box squashes (depth 5 -> 1) and the content drops with it, with a light
 * haptic on press-in. Every button, chip, card and row in the app is one of these.
 */
export function PressBox({ fill, hi, lo, n = 3, depth = 4, bw, style, contentStyle, onPress, onPressIn, onPressOut, onLongPress, disabled, hitSlop = 4, quiet, children }: {
  fill: string; hi?: string | null; lo?: string | null; n?: number; depth?: number; bw?: number;
  style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>;
  onPress?: () => void; onPressIn?: () => void; onPressOut?: () => void; onLongPress?: () => void; disabled?: boolean; hitSlop?: number;
  /** No haptic (the caller does its own). */
  quiet?: boolean; children?: React.ReactNode;
}) {
  const [down, setDown] = useState(false);
  const squash = Math.max(1, depth - 3);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} hitSlop={hitSlop}
      onPressIn={() => { setDown(true); if (!quiet) haptic.press(); onPressIn?.(); }} onPressOut={() => { setDown(false); onPressOut?.(); }}
      style={[style, disabled && { opacity: 0.45 }]}>
      <PixelBox fill={fill} hi={hi} lo={lo} n={n} depth={down ? 1 : depth} bw={bw} style={{ marginTop: down ? squash : 0 }} contentStyle={contentStyle}>
        {children}
      </PixelBox>
    </Pressable>
  );
}

// ---- controls -------------------------------------------------------------------------------
const SIZES = { lg: { h: 58, font: 22, icon: 24, n: 6, px: 22 }, md: { h: 48, font: 18, icon: 24, n: 3, px: 16 }, sm: { h: 40, font: 16, icon: 24, n: 3, px: 12 } };
/** Chunky 3D button (Subway Surfers "RESUME"): thick slab underneath that squashes when pressed. */
export function Btn({ label, onPress, onPressIn, onPressOut, tone = 'green', icon, size = 'md', style, disabled }: {
  label?: string; onPress?: () => void; onPressIn?: () => void; onPressOut?: () => void; tone?: Tone; icon?: IconName;
  size?: keyof typeof SIZES; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  const t = TONES[tone], s = SIZES[size];
  const shadow = tone === 'green' || tone === 'white' ? {} : outline(t.lo, 2);
  return (
    <PressBox fill={t.fill} hi={t.hi} lo={t.lo} n={s.n} depth={5} onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled} style={style}
      contentStyle={{ height: s.h, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: s.px }}>
      {icon ? <PixelIcon name={icon} size={s.icon} color={t.text} /> : null}
      {label ? <Text style={[{ fontFamily: F.display, fontSize: s.font, color: t.text, letterSpacing: 0.5 }, shadow]}>{label}</Text> : null}
    </PressBox>
  );
}

export function IconBtn({ icon, onPress, tone = 'dark', size = 44, active }: { icon: IconName; onPress?: () => void; tone?: Tone; size?: number; active?: boolean }) {
  const t = TONES[active ? 'green' : tone];
  return (
    <PressBox fill={t.fill} hi={t.hi} lo={t.lo} depth={4} hitSlop={6} onPress={onPress} style={{ width: size }}
      contentStyle={{ height: size - 4, alignItems: 'center', justifyContent: 'center' }}>
      <PixelIcon name={icon} size={24} color={active ? C.greenInk : C.white} />
    </PressBox>
  );
}

export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = TONES[on ? 'green' : 'dark'];
  return (
    <PressBox fill={t.fill} hi={t.hi} lo={t.lo} depth={3} onPress={onPress} disabled={!onPress}
      contentStyle={{ height: 34, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <PixelIcon name={icon} size={12} color={on ? C.greenInk : C.white} /> : null}
      <Text style={{ ...uiLabel(11, 0.8), color: on ? C.greenInk : C.dim }}>{label}</Text>
    </PressBox>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const x = useSharedValue(on ? 33 : 5);
  useEffect(() => { x.value = withSpring(on ? 33 : 5, { damping: 14, stiffness: 260 }); }, [on]);
  const knob = useAnimatedStyle(() => ({ left: x.value }));
  return (
    <Pressable onPress={() => { haptic.tap(); onChange(!on); }} hitSlop={8} style={{ width: 62, height: 34 }}>
      <PixelBox fill={on ? C.green : TONES.dark.hi} hi={on ? C.greenHi : C.panelHi} lo={on ? C.greenLo : TONES.dark.lo} depth={0} style={{ width: 62, height: 34 }}>
        <View style={{ height: 34 }} />
      </PixelBox>
      <Animated.View style={[styles.knob, knob]} pointerEvents="none">
        <PixelBox fill={C.white} hi={C.white} lo={TONES.white.lo} depth={0} bw={3} n={3} style={{ width: 24, height: 24 }}><View style={{ height: 24 }} /></PixelBox>
      </Animated.View>
      <View style={[styles.onOff, on ? { left: 9 } : { right: 9 }]} pointerEvents="none">
        <Text style={{ ...uiLabel(9.5, 0.4), color: on ? C.white : C.faint }}>{on ? 'ON' : 'OFF'}</Text>
      </View>
    </Pressable>
  );
}

/** Pixel text input in a well. */
export function Field({ style, ...rest }: TextInputProps) {
  return (
    <PixelBox fill={C.well} depth={0} bw={3} n={3} contentStyle={{ height: 52, justifyContent: 'center', paddingHorizontal: 14 }}>
      <TextInput placeholderTextColor={C.faint} selectionColor={C.green} {...rest}
        style={[{ fontFamily: F.display, fontSize: 20, color: C.white, height: 52, padding: 0 }, style]} />
    </PixelBox>
  );
}

// ---- cards, rows, meters, tiles, badges --------------------------------------------------------
/** Muted content card (Vault grid, trending, market items). Pressable when `onPress` is set. */
export function Card({ onPress, children, style, pad = 8, tone = 'tile' }: { onPress?: () => void; children?: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <PressBox fill={t.fill} hi={t.hi} lo={t.lo} depth={3} onPress={onPress} disabled={!onPress} style={style} contentStyle={{ padding: pad, gap: 6 }}>
      {children}
    </PressBox>
  );
}

/** List row: leading (icon / avatar / thumb), title + meta, trailing. */
export function Row({ leading, title, meta, trailing, onPress, style }: {
  leading?: React.ReactNode; title: React.ReactNode; meta?: React.ReactNode; trailing?: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
}) {
  const t = TONES.tile;
  return (
    <PressBox fill={t.fill} hi={t.hi} lo={t.lo} depth={3} onPress={onPress} disabled={!onPress} style={style}
      contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingRight: 12, minHeight: 56 }}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <T v="card" numberOfLines={1}>{title}</T> : title}
        {meta ? (typeof meta === 'string' ? <T v="small" numberOfLines={1}>{meta}</T> : meta) : null}
      </View>
      {trailing}
    </PressBox>
  );
}

/** Segmented (chunky) meter, or a continuous fill with `smooth`. value 0..1. */
export function SegBar({ value, color, segs = 10, h = 16, bg = C.ink, smooth }: { value: number; color: string; segs?: number; h?: number; bg?: string; smooth?: boolean }) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * segs);
  if (smooth) {
    return (
      <View style={{ backgroundColor: C.ink, padding: 3 }}>
        <View style={{ height: h, backgroundColor: bg + '55' }}>
          <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: h, backgroundColor: color }}><View style={{ height: 3, backgroundColor: '#ffffff44' }} /></View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: C.ink, padding: 3, flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: segs }, (_, i) => (
        <View key={i} style={{ flex: 1, height: h, backgroundColor: i < lit ? color : bg + '55' }}>
          {i < lit ? <View style={{ height: 3, backgroundColor: '#ffffff44' }} /> : null}
        </View>
      ))}
    </View>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Paint gauge: name, refill countdown, segmented bar. `value` and `max` in paint units. */
export function Gauge({ label, color, value, max = 100, regenPerSec }: { label: string; color: string; value: number; max?: number; regenPerSec?: number }) {
  const full = value / max >= 0.995;
  const secs = regenPerSec ? Math.ceil((max - value) / regenPerSec) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.rowBetween}>
        <T v="eyebrow">{label}</T>
        <T v="small">{full ? 'FULL' : regenPerSec ? `FULL IN ${mmss(secs)}` : `${Math.round((value / max) * 100)}%`}</T>
      </View>
      <SegBar value={value / max} color={color} />
    </View>
  );
}

/** Stat tile: big number over a small caption on a muted plate. */
export function Tile({ n, label, style, big }: { n: string | number; label: string; style?: StyleProp<ViewStyle>; big?: boolean }) {
  const t = TONES.tile;
  return (
    <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={3} style={[{ flex: 1 }, style]} contentStyle={{ paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontFamily: F.display, fontSize: big ? 34 : 26, color: C.white, ...outline() }} numberOfLines={1} adjustsFontSizeToFit>{n}</Text>
      <Text style={{ ...ui(12.5, '600'), color: C.dim }} numberOfLines={1}>{label}</Text>
    </PixelBox>
  );
}

/** Small pill: pixel icon + value (coins, streak…). Pressable when `onPress` is set. */
export function Pill({ icon, value, iconColor = C.green, alt = C.greenLo, onPress }: { icon: IconName; value: string | number; iconColor?: string; alt?: string; onPress?: () => void }) {
  const inner = (
    <>
      <PixelIcon name={icon} size={24} color={iconColor} alt={alt} />
      <Text style={{ fontFamily: F.display, fontSize: 17, color: C.white, minWidth: 14 }}>{value}</Text>
    </>
  );
  const content = { height: 38, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 10 };
  return onPress
    ? <PressBox fill={C.plate} hi={PLATE_HI} depth={3} n={3} onPress={onPress} contentStyle={content}>{inner}</PressBox>
    : <PixelBox fill={C.plate} hi={PLATE_HI} depth={3} n={3} contentStyle={content}>{inner}</PixelBox>;
}

/** The one coin counter every tab shows top-right; tapping it opens the Market. */
export function CoinPill() {
  const painter = useStore((s) => s.painter);
  const settings = useStore((s) => s.settings);
  const setSheet = useStore((s) => s.setSheet);
  return <Pill icon="coin" value={coinsOf(painter, settings)} onPress={() => setSheet('market')} />;
}

export function Avatar({ name, color, size = 48 }: { name?: string | null; color: string; size?: number }) {
  return (
    <PixelBox fill={color} hi="#ffffff55" lo="#00000033" depth={3} n={3} style={{ width: size }} contentStyle={{ height: size - 3, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.display, fontSize: size * 0.5, color: C.ink }}>{(name?.[0] ?? 'C').toUpperCase()}</Text>
    </PixelBox>
  );
}

export function Rank({ n }: { n: number }) {
  const tone: Tone = n === 1 ? 'green' : n === 2 ? 'white' : n === 3 ? 'red' : 'dark';
  const t = TONES[tone];
  return (
    <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={2} n={3} style={{ width: 30 }} contentStyle={{ height: 28, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.display, fontSize: 16, color: t.text }}>{n}</Text>
    </PixelBox>
  );
}

export function Divider() {
  return <View style={{ height: 3, borderStyle: 'dashed', borderTopWidth: 3, borderColor: '#ffffff22' }} />;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0 },
  scroll: { padding: GUTTER, paddingTop: 62, paddingBottom: DOCK_INSET, gap: 16 },
  sheetScroll: { paddingTop: 26, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  knob: { position: 'absolute', top: 5 },
  onOff: { position: 'absolute', top: 11 },
});
