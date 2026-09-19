import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Glass } from './Glass';
import { C, DOCK_BOTTOM, DOCK_H } from './theme';
import { useStore, type Tab } from '../store';

const TABS: { key: Tab; label: string; glyph: string }[] = [
  { key: 'home', label: 'Home', glyph: '⌂' },
  { key: 'explore', label: 'Explore', glyph: '◎' },
  { key: 'create', label: 'Create', glyph: '✦' },
  { key: 'social', label: 'Social', glyph: '☺' },
  { key: 'vault', label: 'Vault', glyph: '▦' },
  { key: 'settings', label: 'Settings', glyph: '⚙' },
];

/** Floating glass dock. Tapping a tab gives a light haptic; the active pill springs between tabs. */
export function Dock() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const haptics = useStore((s) => s.settings.haptics);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Glass radius={37} intensity={55} style={styles.dock}>
        {TABS.map((t) => (
          <DockItem key={t.key} label={t.label} glyph={t.glyph} active={tab === t.key} onPress={() => {
            if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            setTab(t.key);
          }} />
        ))}
      </Glass>
    </View>
  );
}

function DockItem({ label, glyph, active, onPress }: { label: string; glyph: string; active: boolean; onPress: () => void }) {
  const s = useSharedValue(active ? 1 : 0);
  useEffect(() => { s.value = withSpring(active ? 1 : 0, { damping: 14, stiffness: 180 }); }, [active]);
  const pill = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.7 + 0.3 * s.value }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * s.value }, { scale: 1 + 0.12 * s.value }] }));
  return (
    <Pressable onPress={onPress} style={styles.item} hitSlop={6}>
      <Animated.View style={[styles.pill, pill]} />
      <Animated.Text style={[styles.glyph, active && { color: C.text }, icon]}>{glyph}</Animated.Text>
      <Text style={[styles.label, active && { color: C.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, bottom: DOCK_BOTTOM },
  dock: { height: DOCK_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  item: { flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30 },
  pill: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: C.pink + '55', borderWidth: 1, borderColor: C.pink + '99' },
  glyph: { color: C.dim, fontSize: 20, fontWeight: '700' },
  label: { color: C.faint, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginTop: 1 },
});
