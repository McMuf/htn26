import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { PixelBox } from './PixelBox';
import { PixelIcon, type IconName } from './PixelIcon';
import { C, DOCK_H, DOCK_PAD, F, TONES } from './theme';
import { useStore, type Tab } from '../store';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'home', label: 'HOME', icon: 'home' },
  { key: 'explore', label: 'EXPLORE', icon: 'explore' },
  { key: 'create', label: 'CREATE', icon: 'create' },
  { key: 'social', label: 'SOCIAL', icon: 'social' },
  { key: 'market', label: 'MARKET', icon: 'market' },
  { key: 'vault', label: 'VAULT', icon: 'vault' },
  { key: 'settings', label: 'SETTINGS', icon: 'settings' },
];

/** Bottom navigation: a solid arcade bar. The active tab pops up as a chunky yellow key. */
export function Dock() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const haptics = useStore((s) => s.settings.haptics);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.edge} />
      <View style={styles.bar}>
        {TABS.map((t) => (
          <DockItem key={t.key} label={t.label} icon={t.icon} active={tab === t.key} onPress={() => {
            if (haptics) Haptics.selectionAsync().catch(() => {});
            setTab(t.key);
          }} />
        ))}
      </View>
    </View>
  );
}

function DockItem({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) {
  const s = useSharedValue(active ? 1 : 0);
  useEffect(() => { s.value = withSpring(active ? 1 : 0, { damping: 12, stiffness: 220 }); }, [active]);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * s.value }] }));
  const t = TONES.yellow;
  return (
    <Pressable onPress={onPress} style={styles.item} hitSlop={2}>
      <Animated.View style={[styles.itemInner, lift]}>
        {active ? (
          <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={4} style={StyleSheet.absoluteFill} contentStyle={{ flex: 1 }}><View style={{ flex: 1 }} /></PixelBox>
        ) : null}
        <PixelIcon name={icon} size={24} color={active ? '#2a1a00' : C.faint} alt={active ? '#7a5200' : '#5d4f96'} />
        <Text style={[styles.label, { color: active ? '#2a1a00' : C.faint }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  edge: { height: 6, backgroundColor: '#4327a8', borderTopWidth: 3, borderTopColor: C.ink },
  bar: { height: DOCK_H + DOCK_PAD - 6, backgroundColor: '#0d062b', flexDirection: 'row', paddingHorizontal: 4, paddingTop: 10 },
  item: { flex: 1, height: 54 },
  itemInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, marginHorizontal: 1 },
  label: { fontFamily: F.labelBold, fontSize: 7, letterSpacing: 0.3 },
});
