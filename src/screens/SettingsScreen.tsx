import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PALETTE, type Cap, type SprayOption } from '../config';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { Glass } from '../ui/Glass';
import { C, DOCK_INSET } from '../ui/theme';

export function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const painter = useStore((s) => s.painter);
  const setPainter = useStore((s) => s.setPainter);
  const setShake = useStore((s) => s.setShake);
  const upd = (key: 'optionA' | 'optionB', patch: Partial<SprayOption>) => setSettings({ [key]: { ...settings[key], ...patch } });

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#101018', C.bg, C.bg]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: DOCK_INSET }]}>
        <Text style={styles.h1}>SETTINGS</Text>

        {(['optionA', 'optionB'] as const).map((key) => (
          <Glass key={key} style={styles.section}>
            <Text style={styles.label}>{key === 'optionA' ? 'BUTTON A · VOLUME UP' : 'BUTTON B · VOLUME DOWN'}</Text>
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
          </Glass>
        ))}

        <Glass style={styles.section}>
          <Text style={styles.label}>INPUT & FEEL</Text>
          <Row label="Volume buttons also spray" sub="on-screen hold buttons are always on" value={settings.volumeButtons} onChange={(v) => setSettings({ volumeButtons: v })} />
          <Row label="Haptics" value={settings.haptics} onChange={(v) => setSettings({ haptics: v })} />
          <Row label="Sound" value={settings.sound} onChange={(v) => setSettings({ sound: v })} />
          <Row label="Show detected AR surfaces" value={settings.showPlanes} onChange={(v) => setSettings({ showPlanes: v })} />
          <Row label="Paint anywhere" sub="bypass the Waterloo Region geofence" value={settings.geofenceBypass} onChange={(v) => setSettings({ geofenceBypass: v })} />
        </Glass>

        <Glass style={styles.section}>
          <Text style={styles.label}>COMPASS-MODE SCALE (camera FOV °): {settings.hfov}</Text>
          <View style={styles.row}>
            {[42, 48, 52, 58, 66].map((v) => (
              <Pressable key={v} onPress={() => setSettings({ hfov: v })} style={[styles.pill, settings.hfov === v && styles.pillOn]}><Text style={styles.pillText}>{v}</Text></Pressable>
            ))}
          </View>
        </Glass>

        <Glass style={styles.section}>
          <Text style={styles.label}>ABOUT</Text>
          <Static k="Version" v="0.1.0 · Hack the North 2026" />
          <Static k="Painter" v={painter?.name ?? '—'} />
          <Static k="Backend" v="Supabase · Waterloo" />
          <Static k="Web" v="fresco web (read-only map + board)" onPress={() => Linking.openURL('https://tagged-web.vercel.app')} />
        </Glass>

        <Glass style={styles.section}>
          <Text style={styles.label}>DEBUG</Text>
          <View style={styles.row}>
            <Pressable onPress={() => setShake(1)} style={styles.pill}><Text style={styles.pillText}>fill can</Text></Pressable>
            <Pressable onPress={() => setSettings({ onboarded: false })} style={styles.pill}><Text style={styles.pillText}>redo onboarding</Text></Pressable>
            <Pressable onPress={() => { setPainter(null); setSettings({ onboarded: false }); supabase.auth.signOut().catch(() => {}); }} style={styles.pill}><Text style={styles.pillText}>sign out</Text></Pressable>
          </View>
        </Glass>
      </ScrollView>
    </View>
  );
}

function Row({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.switchLabel}>{label}</Text>
        {sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.pink }} />
    </View>
  );
}
function Static({ k, v, onPress }: { k: string; v: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.switchRow}>
      <Text style={styles.switchLabel}>{k}</Text>
      <Text style={[styles.sub, onPress && { color: C.cyan }]}>{v}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 18, paddingTop: 66, gap: 12 },
  h1: { color: '#fff', fontWeight: '900', fontSize: 28, letterSpacing: 4 },
  section: { padding: 16, gap: 10 },
  label: { color: C.yellow, fontWeight: '800', fontSize: 11, letterSpacing: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#ffffff22' },
  swatchOn: { borderColor: '#fff', borderWidth: 3 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#ffffff14', borderWidth: 1, borderColor: '#ffffff22' },
  pillOn: { backgroundColor: C.pink, borderColor: C.pink },
  pillText: { color: '#fff', fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 12 },
  switchLabel: { color: '#fff', fontWeight: '600' },
  sub: { color: C.faint, fontSize: 11 },
});
