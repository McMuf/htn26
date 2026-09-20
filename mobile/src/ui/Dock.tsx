import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { PixelBox } from './PixelBox';
import { PixelIcon, type IconName } from './PixelIcon';
import { haptic } from './haptics';
import { C, DOCK_H, DOCK_PAD, TONES, uiLabel } from './theme';
import { useStore, type Tab } from '../store';

type Item = { key: Tab; label: string; icon: IconName };
// Your side of the app on the left, the world on the right, the camera in the middle.
const LEFT: Item[] = [{ key: 'profile', label: 'PROFILE', icon: 'profile' }, { key: 'vault', label: 'VAULT', icon: 'vault' }];
const RIGHT: Item[] = [{ key: 'explore', label: 'EXPLORE', icon: 'pin' }, { key: 'social', label: 'SOCIAL', icon: 'social' }];

/** Bottom navigation: a dark plate with a lit edge; the tab you're on is a purple slab, CREATE is the green can key. */
export function Dock() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const go = (k: Tab) => { haptic.tap(); setTab(k); };
  const item = (t: Item) => <DockItem key={t.key} label={t.label} icon={t.icon} active={tab === t.key} onPress={() => go(t.key)} />;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.edgeLit} />
        <View style={styles.edgeInk} />
        <View style={styles.keys}>
          {LEFT.map(item)}
          <CreateKey active={tab === 'create'} onPress={() => go('create')} />
          {RIGHT.map(item)}
        </View>
      </View>
    </View>
  );
}

function DockItem({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) {
  const s = useSharedValue(active ? 1 : 0);
  const d = useSharedValue(0);
  useEffect(() => { s.value = withSpring(active ? 1 : 0, { damping: 12, stiffness: 220 }); }, [active]);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * s.value + 3 * d.value }] }));
  const t = TONES.purple;
  return (
    <Pressable onPress={onPress} onPressIn={() => { d.value = withSpring(1, { damping: 20, stiffness: 400 }); }} onPressOut={() => { d.value = withSpring(0, { damping: 14, stiffness: 300 }); }} style={styles.item} hitSlop={2}>
      <Animated.View style={[styles.itemInner, lift]}>
        {active ? <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={4} style={StyleSheet.absoluteFill} contentStyle={{ flex: 1 }}><View style={{ flex: 1 }} /></PixelBox> : null}
        <PixelIcon name={icon} size={24} color={active ? C.white : C.dim} alt={active ? C.purpleHi : C.faint} />
        <Text style={[styles.label, { color: active ? C.white : C.dim }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** The centre key: the can on a green slab, a touch taller than its neighbours; purple while you're in the camera. */
function CreateKey({ active, onPress }: { active: boolean; onPress: () => void }) {
  const d = useSharedValue(0);
  const press = useAnimatedStyle(() => ({ transform: [{ translateY: 4 * d.value }] }));
  const t = TONES[active ? 'purple' : 'green'];
  return (
    <Pressable onPress={onPress} onPressIn={() => { d.value = withSpring(1, { damping: 20, stiffness: 400 }); }} onPressOut={() => { d.value = withSpring(0, { damping: 14, stiffness: 300 }); }} hitSlop={4} style={styles.createSlot}>
      <Animated.View style={press}>
        <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} n={6} depth={5} contentStyle={styles.keyIn}>
          <PixelIcon name="can" size={24} color={t.text} alt={active ? C.purpleHi : C.greenLo} />
          <Text style={[styles.keyLabel, { color: t.text }]}>CREATE</Text>
        </PixelBox>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { height: DOCK_H + DOCK_PAD, backgroundColor: C.dockBar },
  edgeLit: { height: 3, backgroundColor: C.panelHi },
  edgeInk: { height: 3, backgroundColor: C.ink },
  keys: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingTop: 6, gap: 6 },
  item: { flex: 1, height: 54 },
  itemInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { ...uiLabel(10, 0.4) },
  createSlot: { flex: 1.15 },
  keyIn: { height: 58, alignItems: 'center', justifyContent: 'center', gap: 2 },
  keyLabel: { ...uiLabel(10, 0.5) },
});
