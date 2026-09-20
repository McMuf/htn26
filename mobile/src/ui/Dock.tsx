import React, { useEffect, useState } from 'react';
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
const RIGHT: Item[] = [{ key: 'explore', label: 'EXPLORE', icon: 'explore' }, { key: 'social', label: 'SOCIAL', icon: 'social' }];

/** Bottom navigation: a solid arcade bar; CREATE is the lit key in the middle, flush with the rest. */
export function Dock() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const go = (k: Tab) => { haptic.tap(); setTab(k); };
  const item = (t: Item) => <DockItem key={t.key} label={t.label} icon={t.icon} active={tab === t.key} onPress={() => go(t.key)} />;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.edge} />
      <View style={styles.bar}>
        {LEFT.map(item)}
        <CreateKey active={tab === 'create'} onPress={() => go('create')} />
        {RIGHT.map(item)}
      </View>
    </View>
  );
}

/** Side keys: lift when active, squash while pressed. */
function DockItem({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) {
  const s = useSharedValue(active ? 1 : 0);
  const d = useSharedValue(0);
  useEffect(() => { s.value = withSpring(active ? 1 : 0, { damping: 12, stiffness: 220 }); }, [active]);
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * s.value + 3 * d.value }] }));
  const t = TONES.green;
  return (
    <Pressable onPress={onPress} onPressIn={() => { d.value = withSpring(1, { damping: 20, stiffness: 400 }); }} onPressOut={() => { d.value = withSpring(0, { damping: 14, stiffness: 300 }); }} style={styles.item} hitSlop={2}>
      <Animated.View style={[styles.itemInner, lift]}>
        {active ? (
          <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} depth={4} style={StyleSheet.absoluteFill} contentStyle={{ flex: 1 }}><View style={{ flex: 1 }} /></PixelBox>
        ) : null}
        <PixelIcon name={icon} size={24} color={active ? C.greenInk : C.dim} alt={active ? C.greenLo : C.faint} />
        <Text style={[styles.label, { color: active ? C.greenInk : C.dim }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** The centre key: a purple slab like the rest of the bar until you're in the camera, then it lights up green. */
function CreateKey({ active, onPress }: { active: boolean; onPress: () => void }) {
  const [down, setDown] = useState(false);
  const t = TONES[active ? 'green' : 'purple'];
  return (
    <Pressable onPress={onPress} onPressIn={() => setDown(true)} onPressOut={() => setDown(false)} hitSlop={4} style={styles.item}>
      <PixelBox fill={t.fill} hi={t.hi} lo={t.lo} n={6} depth={down ? 1 : 4} style={{ marginTop: down ? 3 : 0, marginHorizontal: 3 }}
        contentStyle={styles.keyIn}>
        <PixelIcon name="create" size={24} color={t.text} alt={active ? C.greenLo : C.purpleLo} />
        <Text style={[styles.keyLabel, { color: t.text }]}>CREATE</Text>
      </PixelBox>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  edge: { height: 6, backgroundColor: C.panelHi, borderTopWidth: 3, borderTopColor: C.ink },
  bar: { height: DOCK_H + DOCK_PAD - 6, backgroundColor: C.dockBar, flexDirection: 'row', paddingHorizontal: 4, paddingTop: 10 },
  item: { flex: 1, height: 54 },
  itemInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, marginHorizontal: 3 },
  label: { ...uiLabel(10, 0.4) },
  keyIn: { height: 50, alignItems: 'center', justifyContent: 'center', gap: 2 },
  keyLabel: { ...uiLabel(10, 0.4) },
});
