import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Blur, Canvas, Group, Image } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { WALL_PITCH_RANGE, WALL_PX_PER_DEG, WALL_YAW_RANGE } from '../config';
import { getWall, WALL_H, WALL_W } from './Wall';
import { useStore } from '../store';

export type WallView = {
  canvasId: string;
  heading: number; // canvas centre heading
  resolve: number; // 0 = invisible/blurred, 1 = crisp
};

type Props = {
  yawSV: SharedValue<number>;
  pitchSV: SharedValue<number>;
  rollSV: SharedValue<number>;
  walls: WallView[];
};

/**
 * Draws every nearby wall raster over the camera. The view transform maps the wall's angular
 * space onto the screen using the current pose: yaw offsets slide it sideways, pitch slides it
 * vertically, and the phone's roll rotates it about the screen centre so paint stays level
 * with the world.
 */
export function PaintLayer({ yawSV, pitchSV, rollSV, walls }: Props) {
  const { width, height } = useWindowDimensions();
  const hfov = useStore((s) => s.settings.hfov);
  const version = useStore((s) => s.wallVersion);
  const pxPerDeg = width / hfov;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {walls.map((w) => (
        <WallSprite key={w.canvasId} w={w} cx={width / 2} cy={height / 2} s={pxPerDeg}
          yawSV={yawSV} pitchSV={pitchSV} rollSV={rollSV} version={version} />
      ))}
    </Canvas>
  );
}

function WallSprite({ w, cx, cy, s, yawSV, pitchSV, rollSV, version }: {
  w: WallView; cx: number; cy: number; s: number;
  yawSV: SharedValue<number>; pitchSV: SharedValue<number>; rollSV: SharedValue<number>; version: number;
}) {
  const heading = w.heading;
  const transform = useDerivedValue(() => {
    const dYaw = wrapDiffW(heading, yawSV.value);
    return [
      { translateX: cx },
      { translateY: cy },
      { rotate: (-rollSV.value * Math.PI) / 180 },
      { translateX: (dYaw - WALL_YAW_RANGE) * s },
      { translateY: -(WALL_PITCH_RANGE - pitchSV.value) * s },
      { scale: s / WALL_PX_PER_DEG },
    ];
  }, [heading, cx, cy, s]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const image = useMemo(() => getWall(w.canvasId).snapshot(), [w.canvasId, version]);
  if (!image) return null;
  const blur = (1 - w.resolve) * 22; // in wall px; resolves from a smear into a piece
  return (
    <Group transform={transform} opacity={0.15 + 0.85 * w.resolve}>
      <Image image={image} x={0} y={0} width={WALL_W} height={WALL_H} fit="fill">
        {blur > 0.5 ? <Blur blur={blur} /> : null}
      </Image>
    </Group>
  );
}

function wrapDiffW(a: number, b: number) {
  'worklet';
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}
