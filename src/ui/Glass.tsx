import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { C } from './theme';

/**
 * Translucent glass panel: real blur behind, a 1px light rim on top and a soft inner fill.
 * Wrap content in it wherever the design says "floating card". On Android, expo-blur only blurs
 * an explicit BlurTargetView, so there the panel is a denser tint instead of a live blur.
 */
export function Glass({ children, style, radius = 24, intensity = 40, tint = 'dark' }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; intensity?: number; tint?: 'dark' | 'light';
}) {
  return (
    <View style={[styles.wrap, { borderRadius: radius }, style]}>
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.fill, Platform.OS === 'android' && styles.androidFill, { borderRadius: radius }]} />
      <View style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  fill: { backgroundColor: '#ffffff0d' },
  androidFill: { backgroundColor: '#16161cd0' },
  rim: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: '#ffffff33', borderTopColor: '#ffffff55' },
});

export const glassText = { title: { color: C.text, fontWeight: '900' as const, letterSpacing: 2, fontSize: 12 } };
