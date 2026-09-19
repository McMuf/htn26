# Tagged — r/place, but graffiti in the real world

Aim your phone like a spray can, **hold a volume button** to spray, and your paint stays on that
spot for everyone who walks up to it later. Built for Hack the North (36h MVP), Expo SDK 57,
iOS dev build.

## Run it

```sh
npm install
# 1) backend: paste supabase/schema.sql, then supabase/seed.sql, into the Supabase SQL editor
# 2) native build onto your iPhone (once; later changes are JS-only):
npx expo run:ios --device          # or: eas build --profile development --platform ios
# 3) dev server (any port; the dev client asks for the URL / scans the QR):
npx expo start --dev-client
```

Signing: `npx expo run:ios --device` signs with the team's *development* certificate, and iOS
asks you once to trust it (Settings → General → VPN & Device Management). Your other apps skip
that because they're TestFlight builds. To skip it here too, build an **ad hoc** dev client
instead (no trust prompt, ~15 min in the cloud, Apple login on first run):

```sh
eas build --profile development --platform ios   # then install from the link/QR it prints
``` Env: `.env` holds `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY`
(also baked into `eas.json` for cloud builds).

## Demo path

Open → sign in with email + password (same button creates the account) → pick a tag →
**shake the phone** (ball rattle, can charge fills) → hold **VOL+** and sweep
across a wall (hiss + haptics, paint meter drains) → hold **VOL−** for the second colour/cap →
dwell on one spot to pool and drip → paint runs low (hollow rattle) → walk toward a seeded
piece near E7 → shimmer/edge arrow pulls you in → it resolves from a smear into a piece →
"YOU FOUND A PIECE by …", views tick up → BOARD tab shows the leaderboard.

## AR approach: real surfaces with ARKit (and a compass fallback)

`modules/ar-paint` is a small custom Expo native module (Swift, ~450 lines) wrapping `ARSCNView`:

- ARKit detects horizontal + vertical planes; a raycast from the reticle finds the surface you
  aim at (existing plane geometry first, estimated planes as fallback).
- Paint lives in textures: each surface gets a 5 m × 5 m transparent quad (2048² CoreGraphics
  canvas) glued to a custom `ARAnchor` on that plane. Dabs are composited into it, so frame
  cost doesn't grow with paint. Strokes are recorded in anchor-local metres `(u, v)`.
- **Persistence and sharing** = ARWorldMap. After you paint, the session's world map is saved
  and uploaded to the Supabase Storage bucket `worldmaps`, keyed by canvas. Walking up to that
  canvas (GPS) downloads the map, ARKit relocalises against it, and every stroke is replayed onto
  anchors in the same world frame. Live strokes from another phone arrive with their anchor
  transform and are placed directly. Relocalising *is* the discovery beat: the piece resolves
  when tracking snaps to the saved map.
- Tradeoff: relocalisation wants a similar viewpoint and lighting to the painter's; last writer
  wins on the shared map. Devices without ARKit fall back to the compass-anchored renderer below.

Run `supabase/migration_ar.sql` once for the new columns and storage bucket.

### Compass fallback (`src/screens/PaintScreen.tsx`)

Used only when ARKit is unavailable:

- A **canvas** is a virtual cylindrical wall around the spot where its author stood (GPS) with
  a compass heading for its centre. Paint is stored in **angular coordinates** (yaw, pitch).
- Camera pose comes from our own sensor fusion (`src/hooks/usePose.ts`): pitch/roll from
  gravity, yaw from gyro integration about world-up, corrected toward a tilt-compensated
  magnetometer heading of the *camera axis* (not the phone's top, which is ambiguous when the
  phone is upright). Paint therefore stays glued to the direction you sprayed it, rotates with
  phone roll, and is smooth at 60 Hz.
- Anyone within ~15 m joins the same canvas and sees the same paint in the same direction.
- **Tradeoff:** paint is anchored to a direction from a point, not to a surface. Step several
  metres sideways and it drifts against the real wall; GPS jitter offsets two phones slightly.
  For a campus-scale shared wall demo this reads convincingly; true plane anchoring is the
  first thing to harden (below).
- Rendering: each canvas is an offscreen Skia raster ("Wall", `src/paint/Wall.ts`) that dabs
  are composited into once; the view draws the snapshot with a pose transform, so frame cost
  doesn't grow with paint. FOV scale is tunable in Settings ("AR scale").

## Spray rendering (Curtis et al. adapted cheaply)

`Wall.dab()`: low-alpha soft dabs composited source-over (pigment **buildup** with repeated
passes), a faint darker halo wider than the body (**edge darkening** where blobs overlap only
at rims), seeded-RNG alpha jitter and overspray speckle (**granulation**, deterministic across
phones), and dwell-triggered **drips** that run down the wall.

## Volume buttons as the trigger + fallback

`src/hooks/useVolumeTrigger.ts` (react-native-volume-manager): system volume is pinned to 0.5
with the native HUD hidden. A press nudges it up/down → that tells us VOL+ (option A) vs VOL−
(option B) and we immediately snap back to 0.5. iOS auto-repeats volume changes while a button
is **held**, so "held" = events keep arriving and "released" = no event for ~380 ms. Instant
press-on, ~0.4 s release latency. Hacky but it feels like a nozzle.

Fallback: Settings → "On-screen hold buttons" shows two big hold buttons instead.

## Interaction model

- **Shake to charge**: user-acceleration spikes fill the can (rattle + heavy haptic). Charge
  decays to empty over 60 s; below 12 % the spray weakens then stops ("SHAKE CAN").
- **Paint economy**: per option, 100 units; fat cap ~5.5/s, skinny ~3.5/s; regen 2.2/s while
  not spraying that option; empty can can't spray (empty-can rattle).
- **Haptics**: light impacts at ~14 Hz while paint flows, soft when weak; success on discovery.
- **Geofence**: 25 km circle over Waterloo Region (`GEOFENCE` in `src/config.ts`); bypass toggle
  in Settings for testing elsewhere.

## Discovery mode

`src/hooks/useDiscovery.ts` + `src/components/DiscoveryOverlay.tsx`. Undiscovered pieces within
80 m produce a pull: an edge arrow when off-screen, a twinkling shimmer at their bearing when
on-screen. From 35 m → 14 m the wall raster fades and un-blurs in (Skia blur driven by
distance). Inside 14 m, facing the wall for 0.8 s locks it: views increment (RPC), success
haptic, reveal card with author, time, views, strokes. Discovered/own pieces stay resolved and
show an info chip + report button.

## Data model (Supabase, `supabase/schema.sql`)

| table | purpose |
|---|---|
| `painters` | `id` = Supabase auth user id, unique `name` (your tag); `paint_used`, `strokes` kept by trigger |
| `canvases` | lat/lng + `heading`, author, `views`, `stroke_count`, `flags`/`flagged` |
| `strokes` | `canvas_id`, colour, cap, `points` jsonb `[[yaw,pitch,size,alpha,kind],…]`, `paint_used` |
| `reports` | trigger bumps `canvases.flags`; 2 reports → `flagged` (hidden everywhere) |

RPCs: `nearby_canvases(lat,lng,radius_m)` (haversine), `increment_views(cid)`. Realtime on
`strokes`/`canvases` inserts so a second phone sees strokes live; polling every 15 s as backup.
Auth is Supabase email + password (`src/screens/AuthScreen.tsx`): one button signs in, or
creates the account if it doesn't exist. RLS: everyone can read; inserts require
`author_id`/`reporter_id` = `auth.uid()`, so pieces are always signed by the logged-in user.
For the demo turn **off "Confirm email"** in Authentication → Providers → Email, otherwise
sign-up waits for the emailed link. The client is local-first: strokes render immediately,
are cached in AsyncStorage, and failed uploads queue and retry.

`supabase/seed.sql` (from `scripts/gen_seed.mjs`) drops three pieces around E7 so judges can
discover art without a second phone.

## Home-screen widget

`targets/widget` (via `@bacons/apple-targets`) is a WidgetKit extension showing both paint cans
and the can charge. The app mirrors levels into the App Group `group.com.hamzakhan.tagged`
(`src/lib/widget.ts`) and asks WidgetKit to refresh; the widget also refreshes itself every
15 min. Building it needs the App Groups capability on the app id, so build with
`xcodebuild … -allowProvisioningUpdates` or EAS (plain `expo run:ios` can't register it).

## Sound assets

All SFX are **procedurally generated** by `scripts/gen_sfx.py` (numpy → WAV, 44.1 kHz mono),
so there are no licensing questions: `rattle.wav` (ball clicks), `empty_rattle.wav` (hollow
can + resonance), `hiss.wav` (filtered noise, seamless 1 s loop; volume/rate follow spray
strength and aim pitch as a distance proxy), `pool.wav` (bubbling blips), `click.wav` (nozzle).
Played via `expo-audio` (expo-av is deprecated in SDK 57).

## Layout

```
App.tsx                  tabs (paint/map/board), boot, realtime + polling
src/config.ts            every tunable
src/store.ts             zustand store + AsyncStorage persistence
src/hooks/usePose.ts     sensor fusion → yaw/pitch/roll (shared values)
src/hooks/useVolumeTrigger.ts, useSprayEngine.ts, useDiscovery.ts, useLocation.ts
src/paint/Wall.ts        offscreen raster + spray model;  PaintLayer.tsx  Skia view
src/data/sync.ts         Supabase + local cache
src/screens/*            Paint, Map, Leaderboard, Name, Settings
src/audio/sfx.ts         expo-audio players
supabase/schema.sql, seed.sql;  scripts/gen_sfx.py, gen_seed.mjs
```

## What I'd harden next

1. **Relocalisation UX**: guide the viewer to the painter's original viewpoint (store a thumbnail
   of the first frame), and merge world maps instead of last-writer-wins.
2. **Texture tiling**: 5 m quads per surface are simple; real walls want a tiled atlas so long
   murals don't create seams or overlapping quads.
3. **Volume trigger robustness**: handle the 0/100 % edge cases, Control Center changes, and
   audio-session interruptions; consider a screen-edge squeeze fallback.
4. **Abuse controls**: rate limits per user, stroke size caps, and an admin unflag path.
5. **Stroke compaction**: batch points, delta-encode, and paginate strokes for busy walls.
6. **Battery**: drop sensor rate when idle, pause the camera on other tabs.
