import { Platform, type TextStyle } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

// Cospray "pixel arcade" look: Subway-Surfers chunky slabs x Kahoot purple/primary shapes x
// early-2000s CRT / vaporwave pixel nostalgia. Flat colours, hard edges, hard shadows, no blur.
// The contract lives in docs/ui-plan.md; every colour a screen uses comes from here.
export const C = {
  // base
  bg: '#12082b',
  bg2: '#1c0f42',
  ink: '#0a0620', // outline / hard shadow colour
  // surfaces
  panel: '#2c1868', panelHi: '#4327a8', panelLo: '#1b0f45',
  tile: '#2b2059', tileHi: '#3a2d78', tileLo: '#1c1440',
  plate: '#160b36', // pills, deep plates
  well: '#150a36', // inputs, preview / image wells
  key: '#1f1348', // tray keys, segment buttons
  dockBar: '#0d062b',
  // text ranks
  white: '#ffffff',
  text: '#ffffff',
  dim: '#cdbff5',
  faint: '#8f80c8',
  line: '#ffffff1a',
  // accents (roles in docs/ui-plan.md): two families only — purple is the world, neon green is the signal
  green: '#59d92d', greenHi: '#9cff6b', greenLo: '#2b8a17', greenInk: '#0b2a05',
  purple: '#7a45ff', purpleHi: '#ab8cff', purpleLo: '#4a22b8',
  red: '#ff3d55', redHi: '#ff8a99', redLo: '#a8162c', // danger / low only
};

/** Heat ramp for maps / the widget: cold -> ember -> warm -> blazing. */
export const HEAT = [C.bg2, C.purple, C.green, C.greenHi] as const;

export const F = {
  display: 'PixelifySans_700Bold',
  body: 'PixelifySans_500Medium',
  /** Wordmark only: the classic arcade face, whose C can't be mistaken for an O. */
  arcade: 'PressStart2P_400Regular',
};

export type Tone = 'green' | 'red' | 'purple' | 'dark' | 'white' | 'panel' | 'tile';
/** fill / bevel-highlight / bevel-shade / text for the chunky buttons and panels. */
export const TONES: Record<Tone, { fill: string; hi: string; lo: string; text: string }> = {
  green: { fill: C.green, hi: C.greenHi, lo: C.greenLo, text: C.greenInk },
  red: { fill: C.red, hi: C.redHi, lo: C.redLo, text: C.white },
  purple: { fill: C.purple, hi: C.purpleHi, lo: C.purpleLo, text: C.white },
  dark: { fill: '#1a0f3a', hi: '#3a2a78', lo: '#0f0826', text: C.white },
  white: { fill: C.white, hi: C.white, lo: '#b9aee0', text: C.bg2 },
  panel: { fill: C.panel, hi: C.panelHi, lo: C.panelLo, text: C.white },
  tile: { fill: C.tile, hi: C.tileHi, lo: C.tileLo, text: C.white },
};

/** Screen background tones (top -> bottom) used by <Backdrop>. `purple` is every screen; `night` is the launch page. */
export const BACKDROPS = {
  purple: { top: '#3a1a8a', bottom: '#12082b', star: '#a889ff' },
  night: { top: '#1c0f42', bottom: '#07030f', star: '#7a45ff' },
} as const;
export type BackdropName = keyof typeof BACKDROPS;

/**
 * One face everywhere: Pixelify Sans, bold for anything that carries weight, medium for the rest.
 * The small sizes get a floor and a little tracking, because that — not the face — is what made
 * pixel text unreadable before. `weight` picks the cut; never set fontWeight alongside a custom
 * family or the renderer synthesises its own and the pixel grid goes soft.
 */
export const ui = (size: number, weight: TextStyle['fontWeight'] = '600', letterSpacing = 0): TextStyle => ({
  fontFamily: Number(weight) >= 700 ? F.display : F.body,
  fontSize: Math.max(size, 13),
  letterSpacing: letterSpacing + 0.2,
});
/** All-caps section label / chip text. */
export const uiLabel = (size = 11.5, letterSpacing = 0.9): TextStyle => ({
  fontFamily: F.display,
  fontSize: Math.max(size, 12),
  letterSpacing: letterSpacing + 0.3,
  textTransform: 'uppercase',
});

/** Spacing scale. */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;
export const GUTTER = 18;

export const DOCK_H = 66;
// iPhone: padding for the home indicator. Android: clear the navigation bar too (3-button nav is
// ~48 dp, gesture nav ~20 dp), or the dock's buttons sit under the system buttons.
export const DOCK_PAD = Platform.OS === 'android' ? Math.max(24, (initialWindowMetrics?.insets.bottom ?? 0) + 8) : 24;
export const DOCK_TOTAL = DOCK_H + DOCK_PAD;
/** Space to leave under scrolling content so the dock never covers it. */
export const DOCK_INSET = DOCK_TOTAL + 20;
/** Create-tab layout: the hold buttons sit just above the dock; the tools tray opens above them. */
export const HOLD_BOTTOM = DOCK_TOTAL + 10;
export const HOLD_H = 60;
export const HOLD_TOP = HOLD_BOTTOM + HOLD_H + 5; // top edge of the buttons, measured from the bottom of the screen
/** Camera overlay plates: deliberately colourless (dark plate, white text), so the only colour over the camera is paint. */
export const PLATE = '#120a2e';
export const PLATE_HI = '#2a1c5c';

/** Hard drop shadow for text, the Subway-Surfers "outlined" look without a stroke. */
export const outline = (color: string = C.ink, px = 2) => ({
  textShadowColor: color,
  textShadowOffset: { width: 0, height: px },
  textShadowRadius: 0,
});
