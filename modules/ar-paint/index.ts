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
};

export type ArPaintViewProps = ViewProps & {
  spraying?: boolean;
  paintColor?: string;
  radius?: number; // metres
  flow?: number; // 0..1
  showPlanes?: boolean;
  worldMapPath?: string | null;
  onTracking?: (e: { nativeEvent: ArTrackingEvent }) => void;
  onHit?: (e: { nativeEvent: { hit: boolean; distance: number; drip?: boolean } }) => void;
  onStrokeEnd?: (e: { nativeEvent: ArStroke }) => void;
  onSurface?: (e: { nativeEvent: { id: string; count: number; restored?: boolean } }) => void;
};

export type ArPaintViewRef = {
  saveWorldMap: (path: string) => Promise<{ bytes: number; anchors: number }>;
  addStrokes: (strokes: ArStroke[]) => Promise<void>;
  clearAll: () => Promise<void>;
  resetSession: () => Promise<void>;
};

const NativeModule = requireNativeModule('ArPaint');
export const isArSupported: boolean = !!NativeModule.isSupported;
export const ArPaintView = requireNativeView<ArPaintViewProps & { ref?: Ref<ArPaintViewRef> }>('ArPaint');
