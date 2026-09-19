import { requireNativeModule, requireNativeView } from 'expo';
import type { Ref } from 'react';
import type { ViewProps } from 'react-native';

export type ArStroke = {
  id: string;
  anchorId: string;
  transform: number[]; // 16 floats, column-major, ARKit world space of the canvas's world map
  color: string;
  points: number[][]; // [u, v, radiusM, alpha, kind] in the anchor's plane, metres
  viewer?: number[]; // camera world position when the stroke started (same frame as transform)
};

export type ArTrackingEvent = {
  state: 'normal' | 'limited' | 'notAvailable' | 'mapLoaded' | 'mapLoadFailed';
  reason?: string;
  mapping?: 'notAvailable' | 'limited' | 'extending' | 'mapped' | 'unknown' | '';
  planes?: number;
  surfaces?: number;
  anchors?: number;
  lidar?: boolean;
};

/** What the reticle is on: plane = detected geometry (locked), extended = known plane's extension, mesh = LiDAR, estimated = feature points. */
export type HitKind = 'plane' | 'extended' | 'mesh' | 'estimated' | 'none';
export type ArHitEvent = { hit: boolean; distance: number; drip?: boolean; kind?: HitKind; vertical?: boolean; locked?: boolean };

export type ArPaintViewProps = ViewProps & {
  spraying?: boolean;
  paintColor?: string;
  radius?: number; // metres
  flow?: number; // 0..1
  showPlanes?: boolean;
  worldMapPath?: string | null;
  onTracking?: (e: { nativeEvent: ArTrackingEvent }) => void;
  onHit?: (e: { nativeEvent: ArHitEvent }) => void;
  onStrokeEnd?: (e: { nativeEvent: ArStroke }) => void;
  onSurface?: (e: { nativeEvent: { id: string; count: number; restored?: boolean; kind?: HitKind } }) => void;
};

export type ArPaintViewRef = {
  saveWorldMap: (path: string) => Promise<{ bytes: number; anchors: number }>;
  /** mode 'absolute' (default): same world map as this session. 'relative': no map — place from where the painter stood, relative to the camera now. */
  addStrokes: (strokes: ArStroke[], mode?: 'absolute' | 'relative') => Promise<void>;
  clearAll: () => Promise<void>;
  resetSession: () => Promise<void>;
};

const NativeModule = requireNativeModule('ArPaint');
export const isArSupported: boolean = !!NativeModule.isSupported;
export const hasLidar: boolean = !!NativeModule.hasLidar;
export const ArPaintView = requireNativeView<ArPaintViewProps & { ref?: Ref<ArPaintViewRef> }>('ArPaint');
