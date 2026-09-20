import { requireOptionalNativeModule } from 'expo';

/**
 * The painting session as a Live Activity (iOS 16.2+). The native side lives in ios/ and is rendered by
 * targets/widget/PaintActivity.swift. Missing module (Android, an older binary) => every call no-ops.
 */
const M = requireOptionalNativeModule<any>('LiveActivity');

export const hasLiveActivity = !!M?.hasLiveActivity;
export const areActivitiesEnabled = (): boolean => !!M?.areActivitiesEnabled?.();
export const isActive = (): boolean => !!M?.isActive?.();

export type LaAttrs = { tag: string; colorA: string; nameA: string; colorB: string; nameB: string };
export type LaState = { paintA: number; paintB: number; sprayingSide: 'A' | 'B' | 'none'; startedAt: number; strokes: number };

export const start = (a: LaAttrs, s: LaState): Promise<string> => M.start(a, s);
export const update = (s: LaState): Promise<boolean> => M.update(s);
export const end = (s?: LaState, afterSeconds?: number): Promise<boolean> => M.end(s ?? null, afterSeconds ?? null);
export const endAll = (): Promise<boolean> => M?.endAll?.() ?? Promise.resolve(false);
