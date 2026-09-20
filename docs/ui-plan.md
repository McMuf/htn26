# Cospray UI plan — the design contract

Source of truth for the overhaul. If the build deviates, this file changes in the same commit.

## Direction

**Pixel arcade, one palette, everywhere.** The Profile screen is the reference: CRT purple backdrop,
purple slab panels, yellow labels, green primary buttons, blue secondary panels (quests, market),
red for danger/low. Flat colour, notched corners, hard shadows — no blur, no radius, no gradients
except the banded CRT backdrop. Glassmorphism from the original brief was dropped by decision
(the dock is a solid arcade bar; that idiom is what gets extended, see `ui-audit.md`).

Neon paint colours (`config.ts PALETTE`) appear **only** as paint: swatches, hold buttons, strokes.

## Tokens (`src/ui/theme.ts`)

### Colour
| Token | Value | Role |
|---|---|---|
| `bg` / `bg2` / `ink` | `#12082b` / `#1c0f42` / `#0a0620` | base, deep base, outline + hard shadow |
| `panel` hi/lo | `#2c1868` / `#4327a8` / `#1b0f45` | default panel slab |
| `tile` hi/lo | `#2b2059` / `#3a2d78` / `#1c1440` | muted card, stat tile, list row |
| `plate` | `#160b36` | pills, deep plates |
| `well` | `#150a36` | inputs, preview boxes, image wells |
| `key` | `#1f1348` | tray keys, segment buttons |
| `dockBar` | `#0d062b` | dock bar (edge = `panelHi`) |
| `white` / `dim` / `faint` / `line` | `#ffffff` / `#cdbff5` / `#8f80c8` / `#ffffff1a` | text ranks |
| `yellow` hi/lo, `yellowInk` | `#ffd21f` / `#fff07a` / `#c48f00`, `#2a1a00` | labels, coins, active key; text on yellow |
| `green` hi/lo | `#59d92d` / `#9cff6b` / `#2b8a17` | primary CTA, ready, ON |
| `blue` hi/lo **(new)** | `#3d6cff` / `#8fb0ff` / `#1f3fb8` | secondary panels (quests, market) |
| `blueDeep` hi/lo **(new)** | `#2444b8` / `#3d6cff` / `#182f8a` | wells inside blue panels (counters, previews) |
| `red` hi/lo | `#ff3d55` / `#ff8a99` / `#a8162c` | low paint, danger, sign-out |
| `purple` hi/lo | `#7a45ff` / `#ab8cff` / `#4a22b8` | wordmark shadow, land on the globe |
| `PLATE` / `PLATE_HI` | `#120a2e` / `#2a1c5c` | camera overlay plates (colourless by design) |

Removed: `cyan lime orange violet phosphor phosDim pink card`, backdrops `terminal magenta blue`.
`BACKDROPS`: `purple` (every screen) and `night` (launch only).

Heat ramp (Explore map + widget): 0 `bg2` → `yellowLo` → `yellow` → `red`. User marker `green`.

### Type (`T` variants — screens never set `fontFamily` inline)
| Variant | Face | Size |
|---|---|---|
| `title` | Pixelify 700 + `outline()` | 32 / ls 1 |
| `h` | Pixelify 700 + outline | 20 |
| `card` | Pixelify 700 | 17 |
| `num` / `numBig` | Pixelify 700 + outline | 30 / 34 |
| `body` / `sub` / `small` | system 500 | 15 / 14 / 13 |
| `label` (yellow) / `eyebrow` (white) | system 800 caps ls 1.1 | 11.5 |
| `micro` | system 800 caps ls 0.6 | 10.5 |
| `mono` | VT323 | 22 |
`Wordmark`: Pixelify 700, 56 / ls 8, 3-layer hard shadow (`yellowLo` → `purpleLo` → `ink`); `sm` 22.
Fonts loaded: Pixelify 700, 500; VT323. Silkscreen and Pixelify 400/600 dropped.

### Space, shape, motion
- Spacing scale 4 / 8 / 12 / 16 / 20. Screen gutter 18, panel pad 14 / gap 12, grid gap 14, row gap 8.
- Radius 0. Corners are notched (`PixelBox n`). Outline 3px `ink`. Slab depth 5 (panels), 4 (keys), 3 (cards).
- No blur, no soft shadow, no `LinearGradient`. Glow = stepped rings / ordered dither drawn with Skia rects.
- Haptics (`src/ui/haptics.ts`, all gated on `settings.haptics`): `tap` selection · `press` light impact
  (slab press-in) · `success` · `warn` · `heavy` (launch enter, share).
- Press state: `PressBox` — slab squashes `depth 5→1`, content drops 4px, `press` haptic. Everything
  pressable uses it.
- Transitions: tab content `FadeIn 140ms`; Toggle knob springs; sheets keep the iOS slide; launch → app
  cross-fades (no hard cut).

## Component inventory (`src/ui/kit.tsx` + siblings) — build once, reuse

`PressBox` · `Btn` · `IconBtn` · `Chip` · `Toggle` · `Panel` · `Card` · `Row` · `Tile` · `Pill` ·
`Avatar` · `Rank` · `SegBar` · `Gauge` · `Divider` · `Wordmark` · `Field` · `Empty` · `SheetHeader` ·
`PixelReticle`.

## Screen by screen

| Screen | Changes |
|---|---|
| **Launch** | Rebuilt: dithered pixel Earth on a 4px grid from a real land mask (`src/data/land.ts`), spun on the UI thread (Skia clock + worklet); stepped-ring atmosphere; blinking city pixels; pulsing Waterloo marker with chip; `Wordmark` COSPRAY with dithered spray halo; orbiting `PixelCan`; blinking `PRESS START ▶`; tap → heavy haptic → spray-burst particles + chunky zoom into Waterloo → cross-fade into the app. |
| **Onboarding** | kit `Screen`, `Wordmark`, `Field`, `Btn`; swatches via `PressBox`; social buttons → SOON `Chip`s; gated haptics. |
| **Profile** | `Gauge` extracted; quests `Panel tone="blue"` with `blueDeep` counters; pressable `Pill`; `well`; gated `success`. |
| **Vault** | purple backdrop; `Card` grid; `Empty`; label sizes from kit. |
| **Explore** | purple backdrop; trending `Card`s, nearby `Row`s; heat map on the shared `heat.ts` model, 3 stepped levels in theme colours; fullscreen map gets `Backdrop` + `SheetHeader`. |
| **Social** | purple backdrop; share card = `PixelBox` tile with a Skia dithered band header (no gradient), `numBig`, notched piece thumbs; `Row`s for friends/activity; `Wordmark sm` footer. |
| **Market** | purple backdrop; `SheetHeader`; `Card`s with `blueDeep` preview wells. |
| **Settings** | tokens; animated `Toggle`; `Row`s; sign-out under a `Divider`, out of the debug panel. |
| **Create** | HUD/Discovery tokens only (plates stay colourless); `PixelReticle` replaces the round reticle; PieceDetail gets `Backdrop` + `SheetHeader`; PaintScreen permission view uses `Screen` + `Panel`. Spray hooks and the AR module untouched. |
| **Dock** | tokens; `PressBox` squash on side items; CREATE key unchanged. |
| **Delete** | `AuthScreen`, `NameScreen`, `LeaderboardScreen`, `MapScreen`, `Glass.tsx`, `expo-blur`, unused fonts. |
| **Widget / Live Activity** | `#12082b` background, yellow labels, notched frames, heat ramp above. |

## Brand
COSPRAY in the wordmark, "Cospray" in prose. Bundle id / App Group / slug keep `tagged` (rebuild-safe).

## Build log — where the build differs from the brief or from this plan

- **Glassmorphism dropped** (decision before Phase 3): pixel-arcade is the theme; "the dock aesthetic
  everywhere" means the solid arcade bar / notched slab idiom, not `expo-blur` glass.
- **Launch globe is a Skia runtime shader** (GPU) rather than a worklet-built path: every fragment is
  inverse-projected onto the sphere and samples a 1° land mask (`mobile/src/data/land.ts`, generated by
  `scripts/gen_land.mjs` from Natural Earth). Same look, no per-frame path building on any thread.
- **Live Activity idle timeout is 8 s**, not the brief's "3 s after the last stroke": at 3 s the island
  pops in and out between consecutive strokes. Tune `IDLE_END_MS` in `mobile/src/lib/liveActivity.ts`.
- **Heat payload is a JSON string** in the App Group (`hot`), not a `setObject` blob — one decode path.
- **Reticle** is a pixel crosshair (brackets + ticks), the last rounded control on a live screen.
- Not done: on-device screenshots for `docs/screens/` — `idevicescreenshot` needs a developer tunnel
  on iOS 26; screenshots were checked by eye on the phone instead.
- **`plugins/withoutPushEntitlement.js`**: expo-notifications' autolinked plugin adds the `aps-environment`
  (remote push) entitlement unconditionally, which the team provisioning profile cannot carry; the
  plugin strips it after all other iOS mods since only local notifications are used.
- **Building to the phone**: `npx expo run:ios --device 00008150-000178393A10C01C --no-bundler` from
  `mobile/` (the Xcode UDID, not the CoreDevice id). Metro stays on 8082.
