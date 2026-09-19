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

First-time on the phone: **Settings → General → VPN & Device Management → trust the developer
profile**, then open Tagged. If signing picks the wrong team, change `ios.appleTeamId` in
`app.json`. Env: `.env` holds `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY`
(also baked into `eas.json` for cloud builds).

## Demo path

Open → pick a tag → **shake the phone** (ball rattle, can charge fills) → hold **VOL+** and sweep
across a wall (hiss + haptics, paint meter drains) → hold **VOL−** for the second colour/cap →
dwell on one spot to pool and drip → paint runs low (hollow rattle) → walk toward a seeded
piece near E7 → shimmer/edge arrow pulls you in → it resolves from a smear into a piece →
"YOU FOUND A PIECE by …", views tick up → BOARD tab shows the leaderboard.

## AR approach: geo-anchored canvases (and why)

Fallback ladder from the brief: plane-anchored ARKit → **geo-anchored canvases** → proximity
lists. We chose the middle rung on purpose (see the comment atop `src/screens/PaintScreen.tsx`):

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
- **Geofence**: 1.5 km circle over UW main campus (`GEOFENCE` in `src/config.ts`); bypass toggle
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
| `painters` | pick-a-name identity; `paint_used`, `strokes` maintained by trigger (leaderboard) |
| `canvases` | lat/lng + `heading`, author, `views`, `stroke_count`, `flags`/`flagged` |
| `strokes` | `canvas_id`, colour, cap, `points` jsonb `[[yaw,pitch,size,alpha,kind],…]`, `paint_used` |
| `reports` | trigger bumps `canvases.flags`; 2 reports → `flagged` (hidden everywhere) |

RPCs: `nearby_canvases(lat,lng,radius_m)` (haversine), `increment_views(cid)`. Realtime on
`strokes`/`canvases` inserts so a second phone sees strokes live; polling every 15 s as backup.
RLS is on with permissive anon policies (no auth in MVP). The client is local-first: strokes
render immediately, are cached in AsyncStorage, and failed uploads queue and retry.

`supabase/seed.sql` (from `scripts/gen_seed.mjs`) drops three pieces around E7 so judges can
discover art without a second phone.

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

1. **Real surface anchoring**: ARKit plane detection + persistent anchors (Viro / a small
   native module) so paint sticks to walls under parallax; keep geo canvases as the index.
2. **Heading calibration**: magnetometer near steel buildings drifts 10–20°; add a one-tap
   "align to a piece" and/or share ARKit world maps between phones.
3. **Volume trigger robustness**: handle the 0/100 % edge cases, Control Center changes, and
   audio-session interruptions; consider a screen-edge squeeze fallback.
4. **Auth + abuse**: anonymous Supabase auth so `author_id` is trustworthy, rate limits, and
   proper RLS instead of permissive anon policies.
5. **Stroke compaction**: batch points, delta-encode, and paginate strokes for busy walls.
6. **Battery**: drop sensor rate when idle, pause the camera on other tabs.
