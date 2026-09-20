'use no memo';
import React from 'react';
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetQuest, WidgetSnapshot, WidgetSpot } from '../src/lib/widgetSnapshot';
import { CAN_SPRITE_H, CAN_SPRITE_SVG, CAN_SPRITE_W } from './canSprite';

/**
 * The Android home-screen widget — the RemoteViews counterpart of targets/widget (SwiftUI).
 *
 * Replicates the iOS widget layout for layout:
 *   small  = TODAY + streak, three stats, up to three daily quests with segmented bars
 *   medium = square map plate on the left, header + cans + the nearest two pieces on the right
 *   large  = header, a wide map plate, then cans and the nearest three pieces
 *
 * The map plate draws a hardcoded street grid — iOS's MKMapSnapshotter has no Android equivalent
 * without a Google Maps API key, so the streets are generated rather than fetched. See MapPlate.
 *
 * RemoteViews constraints that shape everything below:
 *  - FlexWidget is 'row' | 'column' only; no 'column-reverse'. Bottom-up fills use child order.
 *  - `flex: 0` collapses a view entirely, so proportional halves floor at 1.
 *  - No transform, position, shadow or rotation. Anything rotated (the bearing arrows) is drawn
 *    inside an SVG, which does support transforms.
 */

/** The library types colours as a template literal; normalise store strings once, here. */
export type Hex = `#${string}`;
export const asHex = (c: string, fallback: Hex = '#ffffff'): Hex =>
  /^#[0-9a-fA-F]{3,8}$/.test(c) ? (c as Hex) : fallback;

/** Theme.swift, token for token. */
const T = {
  bg: '#12082b',
  bg2: '#1c0f42',
  ink: '#0a0620',
  panel: '#2c1868',
  panelHi: '#4327a8',
  tile: '#2b2059',
  well: '#150a36',
  dim: '#cdbff5',
  faint: '#8f80c8',
  purple: '#7a45ff',
  purpleHi: '#ab8cff',
  green: '#59d92d',
  greenHi: '#9cff6b',
  greenLo: '#2b8a17',
  greenInk: '#0b2a05',
  white: '#ffffff',
} as const;

/** cold -> ember -> warm -> blazing, as in theme.ts HEAT. */
const HEAT = [T.bg2, T.purple, T.green, T.greenHi] as const;
const heatLabel = (w: number) => (w < 0.35 ? 'ember' : w < 0.7 ? 'warm' : 'blazing');

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (b: number) => COMPASS[Math.floor(((((b % 360) + 360) % 360) + 22.5) / 45) % 8];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The container background: Bands() from Theme.swift. Seven horizontal steps from #3a1a8a down to
 * #12082b, each seam dithered with a checker of the next band's colour. This is why the iOS widget
 * reads purple at the top and near-black at the bottom rather than flat dark.
 */
function bandsSvg(w: number, h: number, bands = 7): string {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const parts: string[] = [];
  const bh = h / bands;
  for (let i = 0; i < bands; i++) {
    const t = bands === 1 ? 0 : i / (bands - 1);
    const r = Math.round(lerp(0.227, 0.071, t) * 255);
    const g = Math.round(lerp(0.102, 0.031, t) * 255);
    const b = Math.round(lerp(0.541, 0.169, t) * 255);
    const c = `rgb(${r},${g},${b})`;
    parts.push(`<rect x="0" y="${(i * bh).toFixed(2)}" width="${w}" height="${(bh + 1).toFixed(2)}" fill="${c}"/>`);
    if (i > 0) {
      let d = '';
      for (let x = 0; x < w; x += 6) d += `M${x} ${(i * bh - 3).toFixed(2)}h3v3h-3z`;
      parts.push(`<path fill="${c}" d="${d}"/>`);
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" shape-rendering="crispEdges">${parts.join('')}</svg>`;
}

/** The bundled pixel faces, registered by the config plugin's `fonts` list. */
const F = { display: 'PixelifySans_700Bold', arcade: 'PressStart2P_400Regular' };

export interface CosprayWidgetProps {
  snap: WidgetSnapshot;
  /** measured size in dp — Android has no widget families, so the layout is chosen from this */
  widthDp: number;
  heightDp: number;
}

/* ----------------------------------------------------------------- pieces -- */

/** Caps from Theme.swift: uppercase, display face, never below 11pt, green by default. */
function Caps({ text, size = 9, color = T.green }: { text: string; size?: number; color?: Hex }) {
  return (
    <TextWidget
      text={text.toUpperCase()}
      style={{ fontSize: Math.max(size, 11), color, fontFamily: F.display }}
      maxLines={1}
      truncate="END"
    />
  );
}

/** A number over a label, as iOS `Stat`. */
function Stat({ n, label }: { n: number; label: string }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', backgroundColor: T.tile, borderWidth: 2, borderColor: T.ink, paddingVertical: 4, paddingHorizontal: 4 }}>
      <TextWidget text={String(n)} style={{ fontSize: 15, color: T.white, fontFamily: F.display }} maxLines={1} />
      <TextWidget text={label} style={{ fontSize: 8, color: T.faint }} maxLines={1} />
    </FlexWidget>
  );
}

/** SegBar from Theme.swift: lit cells in colour, unlit at 12% white, on an ink plate. */
function SegBar({ value, color, segs = 10, height = 8 }: { value: number; color: Hex; segs?: number; height?: number }) {
  const lit = Math.round((Math.max(0, Math.min(100, value)) / 100) * segs);
  return (
    <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', height: height + 4, backgroundColor: T.ink, padding: 2 }}>
      {Array.from({ length: segs }).map((_, i) => (
        <FlexWidget
          key={i}
          style={{ flex: 1, height: 'match_parent', backgroundColor: i < lit ? color : 'rgba(255, 255, 255, 0.12)', marginRight: i === segs - 1 ? 0 : 2 }}
        />
      ))}
    </FlexWidget>
  );
}

/** One daily quest: title, progress or DONE, and its bar. */
function QuestRow({ q }: { q: WidgetQuest }) {
  const done = q.claimed || q.got >= q.goal;
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 3 }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
        <TextWidget text={q.title} style={{ fontSize: 9, color: T.white }} maxLines={1} truncate="END" />
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget
          text={q.claimed ? 'DONE' : `${q.got}/${q.goal}`}
          style={{ fontSize: 9, color: done ? T.greenHi : T.dim, fontFamily: F.display }}
          maxLines={1}
        />
      </FlexWidget>
      <SegBar value={q.claimed ? 100 : (q.got / Math.max(1, q.goal)) * 100} color={q.claimed ? T.greenHi : T.green} segs={12} height={3} />
    </FlexWidget>
  );
}

/**
 * CanSlot from widgets.swift: the app-icon can sprite, the paint colour chip with its level, and
 * an eight-segment bar. The sprite is drawn with `logo: true` on iOS — fixed palette, no recolour
 * and no level fill — so it is a constant here and the level lives in the chip and the bar.
 */
function CanSlot({ color, level, cell = 1 }: { color: Hex; level: number; cell?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(level)));
  const w = Math.round(CAN_SPRITE_W * 1.35 * cell);
  const h = Math.round(CAN_SPRITE_H * 1.35 * cell);
  return (
    <FlexWidget style={{ flexDirection: 'column', alignItems: 'center' }}>
      <SvgWidget svg={CAN_SPRITE_SVG} style={{ width: w, height: h }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
        <FlexWidget style={{ width: 10, height: 10, backgroundColor: color, borderWidth: 2, borderColor: T.ink }} />
        <TextWidget text={`${pct}%`} style={{ fontSize: 11, color: T.white, fontFamily: F.display, marginLeft: 4 }} maxLines={1} />
      </FlexWidget>
      <FlexWidget style={{ width: 40, marginTop: 3 }}>
        <SegBar value={pct} color={color} segs={8} height={4} />
      </FlexWidget>
    </FlexWidget>
  );
}

function Cans({ snap, cell = 1 }: { snap: WidgetSnapshot; cell?: number }) {
  return (
    <FlexWidget style={{ flexDirection: 'row' }}>
      <CanSlot color={asHex(snap.colorA, '#59d92d')} level={snap.paintA} cell={cell} />
      <FlexWidget style={{ width: 10 }} />
      <CanSlot color={asHex(snap.colorB, '#7a45ff')} level={snap.paintB} cell={cell} />
    </FlexWidget>
  );
}

/** Tag on the left, streak on the right, as iOS `HeaderStrip`. */
function HeaderStrip({ snap }: { snap: WidgetSnapshot }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
      <TextWidget text="COSPRAY" style={{ fontSize: 9, color: T.green, fontFamily: F.arcade }} maxLines={1} />
      <TextWidget text={snap.tag} style={{ fontSize: 11, color: T.dim, fontFamily: F.display, marginLeft: 6 }} maxLines={1} truncate="END" />
      <FlexWidget style={{ flex: 1 }} />
      <Caps text={`${snap.streak} day streak`} size={9} color={T.dim} />
    </FlexWidget>
  );
}

/* ------------------------------------------------------------------ plate -- */

/**
 * The street map is hardcoded.
 *
 * iOS builds its plate from MKMapSnapshotter — Apple's dark tiles, pixelated 4:1, desaturated and
 * tinted purple. The Android equivalent is Google Static Maps, which needs an API key nobody on
 * the team has created, so the streets below are drawn rather than fetched: two families of
 * parallel lines at fixed offsets, rotated and rasterised onto 4dp blocks, which reads as the same
 * pixelated downtown at any plate size and costs no network call in a headless widget update.
 *
 * Only the background is invented. The pins, the centre marker and the scale are the snapshot's
 * real data, projected exactly as widgets.swift projects them.
 */

/** Rotation of the grid, degrees clockwise — matched to the tilt in the iOS widget. */
const GRID_DEG = 32;
/** dp between cell samples. 4 matches `pixelate(cell: 4)` on iOS. */
const MAP_CELL = 4;

/**
 * Avenues and cross streets: offsets within a repeating block, `w` the half-width in dp. The
 * spacings are deliberately uneven — an even one reads as graph paper rather than a city. Roughly
 * 30dp apart, which puts about nine streets across a large plate, as on iOS.
 */
type Family = { period: number; lines: { o: number; w: number }[] };
const AVENUES: Family = { period: 112, lines: [{ o: 0, w: 3.5 }, { o: 33, w: 2 }, { o: 60, w: 2 }, { o: 86, w: 2 }] };
const CROSS: Family = { period: 97, lines: [{ o: 0, w: 3.5 }, { o: 29, w: 2 }, { o: 54, w: 2 }, { o: 74, w: 2 }] };

/**
 * MapPlate's palette: Apple's dark tiles as the iOS widget ends up showing them — desaturated,
 * multiplied by purpleHi, then washed with 35% ink. The streets stay close to the base so the map
 * reads as texture behind the pins rather than as a graphic of its own.
 */
const MAP = { base: '#0c0722', street: '#1d1247', ave: '#271960' } as const;

/** 0 for a block, 1 for a street, 2 for an avenue. Half-widths are >= MAP_CELL / 2 so that a
 *  street always lands on at least one sample and never comes out dashed. */
function band(v: number, fam: Family) {
  const p = fam.period;
  const r = v - Math.floor(v / p) * p;
  let hit = 0;
  for (const L of fam.lines) {
    // the copies either side of the period matter: a street can straddle the block boundary
    const d = Math.min(Math.abs(r - L.o), Math.abs(r - L.o - p), Math.abs(r - L.o + p));
    if (d <= L.w) hit = Math.max(hit, L.w >= 2.5 ? 2 : 1);
  }
  return hit;
}

/**
 * The streets as SVG. Cells are merged along each row into runs, and the runs are accumulated into
 * one `<path>` per colour rather than a rect each: a large plate is ~700 runs, which is 20KB and
 * three elements for AndroidSVG to render instead of 700.
 */
function streetsSvg(W: number, H: number): string {
  const cols = Math.ceil(W / MAP_CELL);
  const rows = Math.ceil(H / MAP_CELL);
  const th = (GRID_DEG * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const cx = W / 2;
  const cy = H / 2;
  // index 0 is the base colour, already painted by the backing rect
  const layers = ['', '', ''];
  for (let r = 0; r < rows; r++) {
    const py = r * MAP_CELL + MAP_CELL / 2 - cy;
    let start = 0;
    let idx = -1;
    for (let c = 0; c <= cols; c++) {
      let next = -1;
      if (c < cols) {
        const px = c * MAP_CELL + MAP_CELL / 2 - cx;
        const a = px * cos + py * sin;
        const b = -px * sin + py * cos;
        next = Math.max(band(a, AVENUES), band(b, CROSS));
      }
      if (next !== idx) {
        if (idx > 0) {
          const w = (c - start) * MAP_CELL;
          layers[idx] += `M${start * MAP_CELL} ${r * MAP_CELL}h${w}v${MAP_CELL}h-${w}z`;
        }
        idx = next;
        start = c;
      }
    }
  }
  const fill = [MAP.base, MAP.street, MAP.ave];
  return (
    `<rect width="${W}" height="${H}" fill="${MAP.base}"/>` +
    layers.map((d, i) => (i > 0 && d ? `<path fill="${fill[i]}" d="${d}"/>` : '')).join('')
  );
}

/* --- the pin --- */

type Cell = readonly [number, number];

/** PixelPin from Theme.swift, cell for cell: notched head, tapered stem, tip at the bottom centre. */
const PIN_CELLS: Cell[] = [
  [1, 0], [2, 0], [3, 0], [4, 0],
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
  [1, 3], [2, 3], [3, 3], [4, 3],
  [2, 4], [3, 4],
  [2, 5], [3, 5],
];

const cellKey = ([x, y]: Cell) => `${x},${y}`;
const dilate = (cells: Cell[]): Cell[] => {
  const seen = new Set(cells.map(cellKey));
  const out = cells.slice();
  for (const [x, y] of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([x + dx, y + dy]);
      }
    }
  }
  return out;
};
const ring = (outer: Cell[], inner: Cell[]): Cell[] => {
  const have = new Set(inner.map(cellKey));
  return outer.filter((c) => !have.has(cellKey(c)));
};

const PIN_D1 = dilate(PIN_CELLS);
const PIN_D2 = dilate(PIN_D1);
/**
 * iOS glows its pins with `.shadow(radius:)`. AndroidSVG 1.4 has no filter support, so the halo is
 * the pin's own silhouette grown a cell at a time — blocky, which suits the rest of the art. The
 * outer ring stays faint: pieces cluster within a few metres of each other and a strong glow turns
 * the cluster into one green blob.
 */
const PIN_HALO_IN = ring(PIN_D1, PIN_CELLS);
const PIN_HALO_OUT = ring(PIN_D2, PIN_D1);

/** One `<path>` of square subpaths — far smaller than a rect per cell. */
const cellsPath = (cells: Cell[], x0: number, y0: number, c: number, pad = 0) =>
  cells
    .map(([cx, cy]) => {
      const s = c + pad * 2;
      return `M${(x0 + cx * c - pad).toFixed(2)} ${(y0 + cy * c - pad).toFixed(2)}h${s.toFixed(2)}v${s.toFixed(2)}h-${s.toFixed(2)}z`;
    })
    .join('');

/** `tipX`/`tipY` is the spot itself: the pin hangs above it, as iOS offsets by half its height. */
function pinSvg(tipX: number, tipY: number, size: number): string {
  const c = size / 6;
  const x0 = tipX - 3 * c;
  const y0 = tipY - 6 * c;
  return (
    `<path fill="${T.green}" opacity="0.08" d="${cellsPath(PIN_HALO_OUT, x0, y0, c)}"/>` +
    `<path fill="${T.green}" opacity="0.2" d="${cellsPath(PIN_HALO_IN, x0, y0, c)}"/>` +
    `<path fill="${T.ink}" d="${cellsPath(PIN_CELLS, x0, y0, c, 1.4)}"/>` +
    `<path fill="${T.green}" d="${cellsPath(PIN_CELLS, x0, y0, c, 0.15)}"/>` +
    `<rect x="${(x0 + 2 * c).toFixed(2)}" y="${(y0 + c).toFixed(2)}" width="${(c + 0.3).toFixed(2)}" height="${(c + 0.3).toFixed(2)}" fill="#ffffff" opacity="0.85"/>`
  );
}

/* --- the plate --- */

/**
 * The map plate: hardcoded streets, then every piece as a neon-green pixel pin (bigger and
 * brighter the hotter it is) and you as a green block in the middle, north up.
 *
 * The scale and SAMPLE labels sit in an OverlapWidget above the SVG rather than inside it, so they
 * render in the bundled pixel face — AndroidSVG only has the system fonts.
 */
function MapPlate({ spots, radiusM, seeded, width, height, showScale = true }: {
  spots: WidgetSpot[]; radiusM: number; seeded: boolean; width: number; height: number; showScale?: boolean;
}) {
  const W = Math.max(40, Math.round(width));
  const H = Math.max(40, Math.round(height));
  const cx = W / 2;
  const cy = H / 2;

  // iOS frames the region on the user, `min(radiusM, 150) * 2` metres tall and square metres per
  // point in both directions. The same projection here keeps the scale label honest.
  const spanM = Math.round(Math.min(Math.max(radiusM, 1), 150)) * 2;
  const mpp = spanM / H;

  const out: string[] = [streetsSvg(W, H)];

  // Painted north-first so nearer-to-camera pins overlap the ones behind them.
  const pins = spots
    .slice(0, 12)
    .map((s) => ({ x: cx + s.dx / mpp, y: cy - s.dy / mpp, d: 11 + 7 * Math.max(0, Math.min(1, s.w)) }))
    .filter((p) => p.x > -p.d && p.x < W + p.d && p.y > -p.d && p.y < H + p.d)
    .sort((a, b) => a.y - b.y);
  for (const p of pins) out.push(pinSvg(p.x, p.y, p.d));

  // You, dead centre: an ink block under a green one, with the same blocky glow as the pins.
  out.push(`<rect x="${(cx - 9).toFixed(2)}" y="${(cy - 9).toFixed(2)}" width="18" height="18" fill="${T.green}" opacity="0.16"/>`);
  out.push(`<rect x="${(cx - 6).toFixed(2)}" y="${(cy - 6).toFixed(2)}" width="12" height="12" fill="${T.ink}"/>`);
  out.push(`<rect x="${(cx - 4).toFixed(2)}" y="${(cy - 4).toFixed(2)}" width="8" height="8" fill="${T.green}"/>`);

  // The frame goes in the SVG, not on the container: the SvgWidget fills the plate exactly, so a
  // `borderWidth` on the parent would be painted over and never seen.
  out.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${T.ink}" stroke-width="2"/>`);

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${out.join('')}</svg>`;

  const labels = showScale ? (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', padding: 5 }}>
      <FlexWidget style={{ flex: 1 }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', width: 'match_parent' }}>
        {seeded ? <Caps text="SAMPLE" size={9} color={T.faint} /> : <FlexWidget style={{ width: 1, height: 1 }} />}
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={`${spanM} M`} style={{ fontSize: 11, color: T.dim, fontFamily: F.display }} maxLines={1} />
      </FlexWidget>
    </FlexWidget>
  ) : (
    <FlexWidget style={{ width: 1, height: 1 }} />
  );

  return (
    <OverlapWidget style={{ width: W, height: H, backgroundColor: MAP.base }}>
      <SvgWidget svg={svg} style={{ width: W, height: H }} />
      {labels}
    </OverlapWidget>
  );
}

/**
 * SpotRow from widgets.swift: heat chip, name, then the bearing arrow, distance and heat label
 * pushed right. The arrow is an SVG because RemoteViews cannot rotate a view.
 */
function SpotRow({ spot, big }: { spot: WidgetSpot; big?: boolean }) {
  const heat = HEAT[spot.w < 0.12 ? 0 : spot.w < 0.35 ? 1 : spot.w < 0.7 ? 2 : 3];
  const arrow = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g transform="rotate(${Math.round(spot.b)} 12 12)"><polygon points="12,3 19,21 12,16 5,21" fill="${T.dim}"/></g></svg>`;
  const dist = spot.d < 1000 ? `${spot.d} M` : `${(spot.d / 1000).toFixed(1)} KM`;
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginTop: 3 }}>
      <FlexWidget style={{ width: 10, height: 10, backgroundColor: heat, borderWidth: 2, borderColor: T.ink }} />
      <TextWidget
        text={spot.n}
        style={{ fontSize: big ? 13 : 11, color: T.white, fontFamily: F.display, marginLeft: 8 }}
        maxLines={1}
        truncate="END"
      />
      <FlexWidget style={{ flex: 1 }} />
      <SvgWidget svg={arrow} style={{ width: 9, height: 9 }} />
      <TextWidget text={dist} style={{ fontSize: big ? 11 : 10, color: T.dim, fontFamily: F.display, marginLeft: 3 }} maxLines={1} />
    </FlexWidget>
  );
}

/* ------------------------------------------------------------------ shell -- */

export function CosprayWidget({ snap, widthDp, heightDp }: CosprayWidgetProps) {
  const PAD = 8;
  const innerW = Math.max(60, widthDp - PAD * 2);
  const innerH = Math.max(60, heightDp - PAD * 2);

  // Android has no widget families, so the three iOS layouts are chosen from the measured size:
  // narrow -> small, tall and wide -> large, otherwise medium.
  const layout: 'small' | 'medium' | 'large' =
    widthDp < 220 ? 'small' : heightDp >= 260 ? 'large' : 'medium';

  // Bands() is the container background on iOS. RemoteViews has no layering, so it is drawn as a
  // backgroundGradient approximating the same purple -> near-black ramp; the dithered seams are a
  // Canvas trick that has no RemoteViews equivalent.
  const shell = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    backgroundGradient: { from: '#3a1a8a' as const, to: '#12082b' as const, orientation: 'TOP_BOTTOM' as const },
    borderWidth: 2,
    borderColor: T.ink,
    padding: PAD,
  };

  const top = snap.spots.slice(0, layout === 'large' ? 3 : 2);
  const a11y = `Cospray. ${snap.spots.length} pieces nearby. Cans ${Math.round(snap.paintA)} and ${Math.round(snap.paintB)} percent.`;

  if (layout === 'small') {
    // Mirrors iOS `small`: TODAY + streak, three stats, up to three quests.
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...shell, flexDirection: 'column' }} accessibilityLabel={a11y}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <Caps text="TODAY" size={11} />
          <FlexWidget style={{ flex: 1 }} />
          <Caps text={`${snap.streak}d`} size={9} color={T.dim} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', marginTop: 4 }}>
          <Stat n={snap.todayStrokes} label="strokes" />
          <FlexWidget style={{ width: 4 }} />
          <Stat n={snap.todayPieces} label="walls" />
          <FlexWidget style={{ width: 4 }} />
          <Stat n={snap.todayPaint} label="paint" />
        </FlexWidget>
        {snap.quests.length > 0 ? (
          <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 2 }}>
            {snap.quests.slice(0, 3).map((q) => <QuestRow key={q.id} q={q} />)}
          </FlexWidget>
        ) : (
          <TextWidget text="open the app to start today's quests" style={{ fontSize: 9, color: T.dim, marginTop: 4 }} maxLines={2} />
        )}
        <FlexWidget style={{ flex: 1 }} />
      </FlexWidget>
    );
  }

  if (layout === 'large') {
    // Mirrors iOS `large`: header, a wide plate, then cans and the nearest three.
    const plateH = Math.max(90, Math.min(Math.round(innerH * 0.45), 172));
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...shell, flexDirection: 'column' }} accessibilityLabel={a11y}>
        <HeaderStrip snap={snap} />
        <FlexWidget style={{ marginTop: 6 }}>
          <MapPlate spots={snap.spots} radiusM={snap.radiusM} seeded={snap.seeded} width={innerW} height={plateH} />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', marginTop: 8 }}>
          <Cans snap={snap} cell={1.15} />
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 12 }}>
            <Caps text="nearest pieces" size={9} />
            {top.length === 0
              ? <TextWidget text="nothing painted near you yet — go first" style={{ fontSize: 10, color: T.dim }} maxLines={2} />
              : top.map((s, i) => <SpotRow key={i} spot={s} big />)}
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }} />
      </FlexWidget>
    );
  }

  // Mirrors iOS `medium`: square plate left, header + cans + nearest two right.
  const plate = Math.max(72, Math.min(innerH, Math.round(innerW * 0.42)));
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...shell, flexDirection: 'row' }} accessibilityLabel={a11y}>
      <MapPlate spots={snap.spots} radiusM={snap.radiusM} seeded={snap.seeded} width={plate} height={plate} showScale={false} />
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10 }}>
        <HeaderStrip snap={snap} />
        <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', marginTop: 6 }}>
          <Cans snap={snap} />
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 10 }}>
            <Caps text="nearest" size={9} />
            {top.length === 0
              ? <TextWidget text="nothing near you yet" style={{ fontSize: 10, color: T.dim }} maxLines={2} />
              : top.map((s, i) => <SpotRow key={i} spot={s} />)}
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }} />
      </FlexWidget>
    </FlexWidget>
  );
}
