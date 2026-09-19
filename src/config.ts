// Central tunables. Everything that affects "feel" lives here so it can be tweaked between demos.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

// ---- AR / projection -------------------------------------------------------
// The camera preview's horizontal field of view in portrait, in degrees. Only needs to be
// consistent across phones for paint to land in the same spot; realism of "sticking to the
// wall" depends on it being close to the real preview FOV (~50-55° on recent iPhones).
export const HFOV_DEG = 52;
// Offscreen wall raster: pixels per degree. 12 px/deg over ±90° yaw × ±60° pitch = 2160×1440.
export const WALL_PX_PER_DEG = 12;
export const WALL_YAW_RANGE = 90; // degrees each side of the canvas centre heading
export const WALL_PITCH_RANGE = 60;

// ---- Canvases / geo --------------------------------------------------------
export const CANVAS_JOIN_RADIUS_M = 15; // stand within this of a canvas to paint on it
export const CANVAS_VISIBLE_RADIUS_M = 35; // paint renders (blurry→sharp) inside this
export const DISCOVERY_SHIMMER_RADIUS_M = 80; // shimmer/pull starts here
export const DISCOVERED_RADIUS_M = 14; // "resolved" -> counts a view, shows the tag
export const NEARBY_FETCH_RADIUS_M = 600;

// Waterloo Region geofence: ~25 km circle centred between Kitchener, Waterloo and Cambridge.
export const GEOFENCE = { lat: 43.45, lng: -80.48, radiusM: 25000 };
// Flip to true to paint anywhere (e.g. testing at home). Also togglable in settings.
export const GEOFENCE_BYPASS_DEFAULT = false;

// ---- Paint economy ---------------------------------------------------------
export const PAINT_MAX = 100;
export const PAINT_COST_PER_SEC = { fat: 5.5, skinny: 3.5 }; // ~18-28s of continuous spray per can
export const PAINT_REGEN_PER_SEC = 2.2;
export const PAINT_EMPTY_THRESHOLD = 1;
export const PAINT_LOW_THRESHOLD = 18; // "hollow rattle" territory

// ---- Shake-the-can ---------------------------------------------------------
export const SHAKE_DECAY_SECONDS = 60; // full → empty in a minute of use
export const SHAKE_MIN_TO_SPRAY = 0.12;
export const SHAKE_ACCEL_THRESHOLD = 2.4; // g, user acceleration magnitude
export const SHAKE_GAIN_PER_EVENT = 0.18;

// ---- Volume trigger --------------------------------------------------------
export const VOLUME_BASELINE = 0.5;
export const VOLUME_HOLD_TIMEOUT_MS = 380; // no repeat event for this long = released

// ---- Spray ----------------------------------------------------------------
export type Cap = 'fat' | 'skinny';
export type SprayOption = { color: string; cap: Cap; name: string };
export const DEFAULT_OPTION_A: SprayOption = { color: '#ff2d95', cap: 'fat', name: 'Hot pink · fat cap' };
export const DEFAULT_OPTION_B: SprayOption = { color: '#19e6ff', cap: 'skinny', name: 'Cyan · skinny cap' };
export const PALETTE = ['#ff2d95', '#19e6ff', '#ffe600', '#7cff3a', '#ff5c1a', '#b26bff', '#ffffff', '#111111'];
export const CAP_RADIUS_DEG: Record<Cap, number> = { fat: 2.6, skinny: 1.15 };
export const DWELL_POOL_SECONDS = 1.1; // hold on one spot this long → pooling + drips
export const DWELL_RADIUS_DEG = 1.2;
