import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { AlphaType, Canvas, ColorType, Fill, FilterMode, ImageShader, MipmapMode, Rect, Shader, Skia, useClock } from '@shopify/react-native-skia';
import Animated, { Easing, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Backdrop } from '../ui/Backdrop';
import { LOGO_CAN_H, LOGO_CAN_W, LogoCan } from '../ui/LogoCan';
import { Wordmark } from '../ui/kit';
import { haptic } from '../ui/haptics';
import { C, F, uiLabel } from '../ui/theme';
import { rgb } from '../ui/color';
import { seededRng } from '../lib/ids';
import { PALETTE } from '../config';
import { LAND_B64, LAND_H, LAND_W } from '../data/land';

const TILT = 0.42; // radians, tip the pole toward the viewer
const SPIN_RATE = 0.28; // rad/s
const CELL = 4; // one globe pixel
const WATERLOO = { lat: 43.47, lng: -80.54 };
// glowing "cities" so the globe reads as inhabited
const CITIES = [WATERLOO, { lat: 40.7, lng: -74 }, { lat: 37.8, lng: -122.4 }, { lat: 51.5, lng: -0.1 }, { lat: 48.9, lng: 2.3 }, { lat: 35.7, lng: 139.7 },
  { lat: -33.9, lng: 151.2 }, { lat: 19.4, lng: -99.1 }, { lat: -23.5, lng: -46.6 }, { lat: 28.6, lng: 77.2 }, { lat: 1.3, lng: 103.8 }, { lat: 30, lng: 31.2 }, { lat: 55.8, lng: 37.6 }, { lat: -1.3, lng: 36.8 }];
const d2r = Math.PI / 180;

/** Sphere point -> screen, sharing the maths with the shader. Worklet so the UI thread can place the chip and the can. */
function project(latDeg: number, lngDeg: number, spin: number, cx: number, cy: number, r: number) {
  'worklet';
  const lat = latDeg * d2r, lng = lngDeg * d2r + spin;
  const x = Math.cos(lat) * Math.sin(lng), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lng);
  const y = y0 * Math.cos(TILT) - z0 * Math.sin(TILT), z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT);
  return { sx: cx + r * x, sy: cy - r * y, z };
}

const f = (hex: string) => { const [r, g, b] = rgb(hex); return `half4(${(r / 255).toFixed(3)}, ${(g / 255).toFixed(3)}, ${(b / 255).toFixed(3)}, 1.0)`; };

/**
 * The pixel Earth. Every fragment snaps to a CELL grid, is inverse-projected onto the tilted,
 * spinning sphere, looks up the 1° land mask, and is lit in three posterised steps with an ordered
 * dither between them. Outside the disc: three stepped atmosphere rings. Cities blink; Waterloo pulses.
 */
const SOURCE = `
uniform shader land;
uniform float2 c; uniform float R; uniform float cell; uniform float spin; uniform float t;
uniform float2 cities[${CITIES.length}];
const float PI = 3.14159265;
const float TILT = ${TILT.toFixed(4)};
half4 main(float2 p) {
  float2 q = floor(p / cell) * cell + cell * 0.5;
  float2 g = floor(p / cell);
  float checker = mod(g.x + g.y, 2.0);
  float2 d = (q - c) / R;
  float r2 = dot(d, d);
  if (r2 > 1.0) {
    float r = sqrt(r2);
    if (r < 1.05) return ${f('#4327a8')};
    if (r < 1.11 && checker < 0.5) return ${f('#4327a8')};
    if (r < 1.11) return ${f('#2c1868')};
    if (r < 1.19 && checker < 0.5) return ${f('#2c1868')};
    return half4(0.0);
  }
  float x = d.x, y = -d.y, z = sqrt(1.0 - r2);
  float y0 = y * cos(TILT) + z * sin(TILT);
  float z0 = -y * sin(TILT) + z * cos(TILT);
  float lat = asin(clamp(y0, -1.0, 1.0));
  float lng = atan(x, z0) - spin;
  float u = fract(lng / (2.0 * PI) + 0.5);
  float v = 0.5 - lat / PI;
  bool isLand = land.eval(float2(u * ${LAND_W}.0, v * ${LAND_H}.0)).r > 0.5;
  // cities: a single neon-green pixel where a city projects to the front, each blinking on its own phase
  for (int i = 0; i < ${CITIES.length}; i++) {
    float clat = cities[i].x, clng = cities[i].y + spin;
    float cx = cos(clat) * sin(clng), cy0 = sin(clat), cz0 = cos(clat) * cos(clng);
    float cy = cy0 * cos(TILT) - cz0 * sin(TILT), cz = cy0 * sin(TILT) + cz0 * cos(TILT);
    if (cz < 0.05) continue;
    float2 sp = float2(c.x + R * cx, c.y - R * cy);
    if (length(q - sp) < cell * 0.8 && fract(t * 0.7 + float(i) * 0.37) < 0.6) return ${f('#59d92d')};
  }
  // three-step lighting from the upper left, dithered at the boundaries
  float shade = dot(float3(x, y, z), normalize(float3(-0.45, 0.55, 0.7)));
  float lvl = shade > 0.62 ? 2.0 : shade > 0.18 ? 1.0 : 0.0;
  if (shade > 0.50 && shade <= 0.62 && checker < 0.5) lvl = 2.0;
  if (shade > 0.08 && shade <= 0.18 && checker < 0.5) lvl = 1.0;
  if (r2 > 0.90 && checker < 0.5) lvl = max(0.0, lvl - 1.0); // limb dither
  if (isLand) return lvl > 1.5 ? ${f('#ab8cff')} : lvl > 0.5 ? ${f('#7a45ff')} : ${f('#4a22b8')};
  return lvl > 1.5 ? ${f('#2c1868')} : lvl > 0.5 ? ${f('#1c0f42')} : ${f('#12082b')};
}`;
const EFFECT = Skia.RuntimeEffect.Make(SOURCE);

/** 360x180 land mask as a one-channel image the shader samples with nearest filtering. */
function makeLandImage() {
  const bin = globalThis.atob(LAND_B64); // Hermes ships atob
  const px = new Uint8Array(LAND_W * LAND_H * 4);
  for (let i = 0; i < LAND_W * LAND_H; i++) {
    const on = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
    px[i * 4] = on ? 255 : 0; px[i * 4 + 3] = 255;
  }
  return Skia.Image.MakeImage({ width: LAND_W, height: LAND_H, alphaType: AlphaType.Opaque, colorType: ColorType.RGBA_8888 }, Skia.Data.fromBytes(px), LAND_W * 4);
}

export function LaunchScreen({ onEnter, onDone }: { onEnter: () => void; onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const R = Math.round(Math.min(W, H) * 0.34 / CELL) * CELL;
  const CX = Math.round(W / 2 / CELL) * CELL, CY = Math.round(H * 0.42 / CELL) * CELL;
  const land = useMemo(makeLandImage, []);
  const clock = useClock();
  const [entering, setEntering] = useState(false);
  const enteringSV = useSharedValue(0);
  const zoom = useSharedValue(1);
  const fade = useSharedValue(1);
  const burst = useSharedValue(0);
  const target = useSharedValue({ x: CX, y: CY });
  const spin = useDerivedValue(() => {
    const s = clock.value / 1000;
    return s * SPIN_RATE * (1 - 0.85 * enteringSV.value);
  });
  const uniforms = useDerivedValue(() => ({
    c: [CX, CY], R, cell: CELL, spin: spin.value, t: clock.value / 1000,
    cities: CITIES.map((c) => [c.lat * d2r, c.lng * d2r]),
  }));

  // the zoom still lands on Waterloo, but nothing marks it on the sphere
  const wl = useDerivedValue(() => project(WATERLOO.lat, WATERLOO.lng, spin.value, CX, CY, R));
  // The logo can orbits on an inclined ring, leaning into the turn. Two copies: one drawn under the
  // globe (shown on the far half, so the Earth really occludes it) and one over it, never both.
  const CAN_CELL = 2, CAN_W = LOGO_CAN_W * CAN_CELL, CAN_H = LOGO_CAN_H * CAN_CELL;
  const orbit = useDerivedValue(() => {
    const a = spin.value * 2.2;
    return { x: CX + R * 1.5 * Math.cos(a), y: CY + R * 0.55 * Math.sin(a) - R * 0.05, z: Math.sin(a), a };
  });
  const canLayer = (front: boolean) => useAnimatedStyle(() => {
    const o = orbit.value;
    const show = front ? o.z >= 0 : o.z < 0;
    return {
      opacity: show ? 1 - enteringSV.value : 0,
      transform: [{ translateX: o.x - CAN_W / 2 }, { translateY: o.y - CAN_H / 2 }, { rotate: `${-18 * Math.cos(o.a)}deg` }, { scale: 0.86 + 0.14 * Math.max(0, o.z) }],
    };
  });
  const canFront = canLayer(true), canBack = canLayer(false);

  const enter = () => {
    if (entering) return;
    setEntering(true);
    enteringSV.value = withTiming(1, { duration: 300 });
    haptic.heavy();
    const p = wl.value;
    target.value = { x: p.z > 0 ? p.sx : CX, y: p.z > 0 ? p.sy : CY };
    burst.value = 0;
    burst.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    zoom.value = withDelay(120, withTiming(7, { duration: 1000, easing: Easing.in(Easing.cubic) }));
    // hand over while still zooming so the app fades in underneath
    fade.value = withDelay(120, withTiming(0, { duration: 1000, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(onDone)(); }));
    setTimeout(onEnter, 650);
  };
  const globeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: (CX - target.value.x) * (zoom.value - 1) }, { translateY: (CY - target.value.y) * (zoom.value - 1) }, { scale: zoom.value }],
  }));
  const copyStyle = useAnimatedStyle(() => ({ opacity: fade.value * (1 - enteringSV.value) }));

  // attract-mode blink
  const blink = useSharedValue(1);
  useEffect(() => { blink.value = withRepeat(withSequence(withTiming(1, { duration: 10 }), withDelay(480, withTiming(0, { duration: 10 })), withDelay(260, withTiming(0, { duration: 1 }))), -1); }, []);
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  return (
    <Pressable style={styles.root} onPress={enter}>
      <Backdrop tone="night" />
      <Twinkle width={W} height={H} clock={clock} />
      <Animated.View style={[styles.can, canBack]} pointerEvents="none"><LogoCan cell={CAN_CELL} puff={false} /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, globeStyle]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={EFFECT!} uniforms={uniforms}>
              <ImageShader image={land} fit="none" tx="repeat" ty="clamp" sampling={{ filter: FilterMode.Nearest, mipmap: MipmapMode.None }} />
            </Shader>
          </Fill>
        </Canvas>
        <Burst origin={target} progress={burst} />
      </Animated.View>
      <Animated.View style={[styles.can, canFront]} pointerEvents="none"><LogoCan cell={CAN_CELL} puff={false} /></Animated.View>
      <Animated.View style={[styles.copy, { bottom: H * 0.1 }, copyStyle]} pointerEvents="none">
        <Wordmark />
        <Text style={styles.tag}>the world is your wall</Text>
        <Animated.Text style={[styles.cta, blinkStyle]}>▶ PRESS START</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

/** A few backdrop stars that flicker. */
function Twinkle({ width, height, clock }: { width: number; height: number; clock: { value: number } }) {
  const stars = useMemo(() => { const rng = seededRng('twinkle'); return Array.from({ length: 14 }, (_, i) => ({ x: Math.floor((rng() * width) / 3) * 3, y: Math.floor((rng() * height * 0.55) / 3) * 3, ph: i * 0.61 })); }, [width, height]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s, i) => <Star key={i} x={s.x} y={s.y} ph={s.ph} clock={clock} />)}
    </Canvas>
  );
}
function Star({ x, y, ph, clock }: { x: number; y: number; ph: number; clock: { value: number } }) {
  const op = useDerivedValue(() => ((clock.value / 1000 + ph) % 1.7 < 0.25 ? 1 : 0.15));
  return <Rect x={x} y={y} width={3} height={3} color={C.white} opacity={op} />;
}

/** 24 pixel spray particles out of the beacon on enter, in paint colours. */
function Burst({ origin, progress }: { origin: { value: { x: number; y: number } }; progress: { value: number } }) {
  const parts = useMemo(() => { const rng = seededRng('burst'); return Array.from({ length: 24 }, (_, i) => ({ a: rng() * Math.PI * 2, r: 30 + rng() * 90, s: 3 + Math.round(rng() * 3), color: PALETTE[i % (PALETTE.length - 1)] })); }, []);
  return <>{parts.map((p, i) => <Particle key={i} p={p} origin={origin} progress={progress} />)}</>;
}
function Particle({ p, origin, progress }: { p: { a: number; r: number; s: number; color: string }; origin: { value: { x: number; y: number } }; progress: { value: number } }) {
  const st = useAnimatedStyle(() => {
    const t = progress.value;
    const k = 1 - Math.pow(1 - t, 3);
    return { opacity: t <= 0 || t >= 1 ? 0 : 1 - t * 0.8, transform: [{ translateX: origin.value.x + Math.cos(p.a) * p.r * k }, { translateY: origin.value.y + Math.sin(p.a) * p.r * k }] };
  });
  return <Animated.View style={[styles.particle, { width: p.s, height: p.s, backgroundColor: p.color }, st]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  can: { position: 'absolute', left: 0, top: 0 },
  particle: { position: 'absolute', left: 0, top: 0 },
  copy: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8 },
  tag: { color: C.dim, fontFamily: F.body, fontSize: 16, letterSpacing: 1, marginTop: 6 },
  cta: { color: C.green, ...uiLabel(13, 2.5), marginTop: 14 },
});
