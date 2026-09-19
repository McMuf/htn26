import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { PALETTE, type Cap, type SprayOption } from '../config';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';

export function SettingsScreen() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const painter = useStore((s) => s.painter);
  const setPainter = useStore((s) => s.setPainter);
  const setShake = useStore((s) => s.setShake);

  const upd = (key: 'optionA' | 'optionB', patch: Partial<SprayOption>) => setSettings({ [key]: { ...settings[key], ...patch } });

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
      <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.head}>
          <Text style={styles.h1}>SETTINGS</Text>
          <Pressable onPress={() => setOpen(false)} hitSlop={10}><Text style={styles.close}>Done</Text></Pressable>
        </View>

        {(['optionA', 'optionB'] as const).map((key) => (
          <View key={key} style={styles.section}>
            <Text style={styles.label}>{key === 'optionA' ? 'VOLUME UP  →  option A' : 'VOLUME DOWN  →  option B'}</Text>
            <View style={styles.row}>
              {PALETTE.map((c) => (
                <Pressable key={c} onPress={() => upd(key, { color: c })} style={[styles.swatch, { backgroundColor: c }, settings[key].color === c && styles.swatchOn]} />
              ))}
            </View>
            <View style={styles.row}>
              {(['fat', 'skinny'] as Cap[]).map((cap) => (
                <Pressable key={cap} onPress={() => upd(key, { cap })} style={[styles.pill, settings[key].cap === cap && styles.pillOn]}>
                  <Text style={styles.pillText}>{cap} cap</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Row label="On-screen hold buttons (fallback if volume trigger breaks)" value={settings.onScreenButtons} onChange={(v) => setSettings({ onScreenButtons: v })} />
        <Row label="Paint anywhere (bypass Waterloo Region geofence)" value={settings.geofenceBypass} onChange={(v) => setSettings({ geofenceBypass: v })} />
        <Row label="Show detected AR surfaces" value={settings.showPlanes} onChange={(v) => setSettings({ showPlanes: v })} />
        <Row label="Sound" value={settings.sound} onChange={(v) => setSettings({ sound: v })} />
        <Row label="Haptics" value={settings.haptics} onChange={(v) => setSettings({ haptics: v })} />

        <View style={styles.section}>
          <Text style={styles.label}>AR SCALE (camera FOV, degrees): {settings.hfov}</Text>
          <View style={styles.row}>
            {[42, 48, 52, 58, 66].map((v) => (
              <Pressable key={v} onPress={() => setSettings({ hfov: v })} style={[styles.pill, settings.hfov === v && styles.pillOn]}><Text style={styles.pillText}>{v}</Text></Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>DEBUG</Text>
          <View style={styles.row}>
            <Pressable onPress={() => setShake(1)} style={styles.pill}><Text style={styles.pillText}>fill can</Text></Pressable>
            <Pressable onPress={() => { setPainter(null); setOpen(false); supabase.auth.signOut().catch(() => {}); }} style={styles.pill}><Text style={styles.pillText}>sign out ({painter?.name})</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#ff2d95' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f', padding: 20 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 8 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 20, letterSpacing: 3 },
  close: { color: '#19e6ff', fontWeight: '800', fontSize: 16 },
  section: { marginBottom: 20 },
  label: { color: '#ffe600', fontWeight: '800', fontSize: 12, letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#ffffff22' },
  swatchOn: { borderColor: '#fff', borderWidth: 3 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#ffffff14', borderWidth: 1, borderColor: '#ffffff22' },
  pillOn: { backgroundColor: '#ff2d95', borderColor: '#ff2d95' },
  pillText: { color: '#fff', fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ffffff11', gap: 12 },
  switchLabel: { color: '#fff', flex: 1 },
});
