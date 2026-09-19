import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';
import type { ComponentType, Ref } from 'react';
import type { ViewProps } from 'react-native';

export type ArStroke = {
  id: string;
  anchorId: string;
  transform: number[]; // 16 floats, column-major, north-aligned world space of the canvas's world map
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
  /** Android: ARCore Depth API active (depth-from-motion on phones without a depth sensor). */
  depth?: boolean;
  /** Android: the compass → north-aligned frame calibration. */
  heading?: 'calibrating' | 'ready';
};

/** What the reticle is on: plane = detected geometry (locked), extended = known plane's extension, mesh = LiDAR (iPhone) / depth (Android), estimated = feature points. */
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

export type ArPlatform = 'arkit' | 'arcore';
export type VolumeKeyEvent = { key: 'up' | 'down'; action: 'down' | 'up' };

type ArPaintNativeModule = {
  isSupported?: boolean;
  hasLidar?: boolean;
  platform?: ArPlatform;
  cloudAnchors?: boolean;
  setVolumeKeysIntercepted?: (enabled: boolean) => void;
  addListener: (event: 'onVolumeKey', fn: (e: VolumeKeyEvent) => void) => EventSubscription;
};

// Optional: the module exists on iOS (ARKit) and Android (ARCore) dev builds, not on web.
const NativeModule = requireOptionalNativeModule<ArPaintNativeModule>('ArPaint');
export const isArSupported: boolean = !!NativeModule?.isSupported;
export const hasLidar: boolean = !!NativeModule?.hasLidar;
/** Which AR stack wrote a saved map / stroke; each platform can only relocalise against its own maps. */
export const arPlatform: ArPlatform | null = NativeModule ? (NativeModule.platform ?? 'arkit') : null;
/** Android: Cloud Anchors are configured (ARCore API key present), so pieces can be saved for exact re-placement. */
export const hasCloudAnchors: boolean = !!NativeModule?.cloudAnchors;
export const ArPaintView = (NativeModule ? requireNativeView('ArPaint') : () => null) as ComponentType<ArPaintViewProps & { ref?: Ref<ArPaintViewRef> }>;

/** Android only: real volume-key press/release (the keys are swallowed while intercepted). */
export const volumeKeys = NativeModule?.setVolumeKeysIntercepted
  ? {
      setIntercepted: (enabled: boolean) => NativeModule.setVolumeKeysIntercepted!(enabled),
      addListener: (fn: (e: VolumeKeyEvent) => void) => NativeModule.addListener('onVolumeKey', fn),
    }
  : null;

/** Quads made on Android are named "paint-a-…", iPhone ones "paint-…". */
export function strokePlatform(anchorId: string): ArPlatform {
  return anchorId.startsWith('paint-a-') ? 'arcore' : 'arkit';
}

/** Saved maps: iPhone ARWorldMap = "<canvas>.arworldmap", Android Cloud Anchor list = "<canvas>.arcore.json". */
export function worldMapPlatform(path: string): ArPlatform {
  return path.endsWith('.arcore.json') ? 'arcore' : 'arkit';
}
export const worldMapExtension = arPlatform === 'arcore' ? '.arcore.json' : '.arworldmap';
