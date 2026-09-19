import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ensurePainter } from '../data/sync';
import { useStore } from '../store';

export function NameScreen() {
  const setPainter = useStore((s) => s.setPainter);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    const n = name.trim().slice(0, 20);
    if (!n) return;
    setBusy(true);
    setPainter(await ensurePainter(n));
    setBusy(false);
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.box}>
        <Text style={styles.brand}>TAGGED</Text>
        <Text style={styles.sub}>r/place, but graffiti in the real world.</Text>
        <Text style={styles.label}>Pick your tag</Text>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. BANKSY_JR" placeholderTextColor="#ffffff44" autoCapitalize="characters" autoCorrect={false} maxLength={20} style={styles.input} onSubmitEditing={go} returnKeyType="go" />
        <Pressable onPress={go} disabled={busy || !name.trim()} style={[styles.btn, (!name.trim() || busy) && { opacity: 0.4 }]}>
          <Text style={styles.btnText}>{busy ? '…' : 'START PAINTING'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f', justifyContent: 'center', padding: 28 },
  box: { gap: 12 },
  brand: { color: '#fff', fontWeight: '900', fontSize: 44, letterSpacing: 6 },
  sub: { color: '#ffffffaa', fontSize: 14, marginBottom: 24 },
  label: { color: '#ffe600', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  input: { borderWidth: 2, borderColor: '#ff2d95', borderRadius: 14, color: '#fff', fontSize: 22, fontWeight: '800', padding: 14 },
  btn: { backgroundColor: '#ff2d95', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '900', letterSpacing: 2 },
});
