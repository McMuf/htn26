> **This branch (`web-deploy`) is what Vercel builds.** It is `main` plus the `web/` directory
> only — the QR entry flow, anonymous sign-in and the keys for the live Supabase project — so
> native/Android work can never break the deployed site. Nothing else on this branch is current;
> the phone app lives on `main` and `adarsh-samsung`.
>
> Vercel settings: **Production Branch** `web-deploy`, **Root Directory** `web`. The Supabase keys
> are committed in `web/.env.production`, so no dashboard environment variables are needed — and
> if any `VITE_SUPABASE_*` variables *are* set there they win over the committed file, so they
> must hold the same values or be deleted.
>
> To pull in later web changes: `git checkout web-deploy && git checkout <branch> -- web/`.

# Tagged — mobile web

Phone-browser version of Tagged (Vite + React 19 + TypeScript). Same Supabase project, tables,
auth and canvas model as the iPhone app in the repo root, so both clients paint the same walls.

```sh
cd web
npm install
npm run dev        # https is needed on a phone for camera/sensors: use `npx vite --host` + a tunnel, or the Vercel URL
npm run build      # tsc + vite → dist/
```

Live: https://tagged-web-devhamzakhans-projects.vercel.app (Vercel project `tagged-web`,
root directory `web`, deploys from GitHub `main`).

## What's different from the iPhone app

| | iPhone app | web |
|---|---|---|
| surfaces | ARKit planes + world maps | compass-anchored walls (camera + deviceorientation) |
| trigger | hold volume buttons | two on-screen HOLD buttons (VOL+/VOL− equivalents) |
| sensors | expo-sensors fusion | `deviceorientation` (+ `webkitCompassHeading` on iOS), `devicemotion` for shake |
| sound | expo-audio | Web Audio, same generated WAVs in `public/sfx` |
| haptics | expo-haptics | `navigator.vibrate` where supported (Android) |
| widget | WidgetKit | — |

## Sync between clients

- Web strokes are compass strokes: `points = [[yaw, pitch, size°, alpha, kind], …]`, `anchor_id = null`.
  The iPhone app renders them as an overlay on top of its AR view (same renderer as its fallback).
- iPhone AR strokes carry an anchor transform in a north-aligned metric frame (ARKit
  `gravityAndHeading`, origin ≈ the canvas GPS point). The web projects each dab onto the compass
  sphere in `src/data/sync.ts` (`projectArStroke`) so pieces painted in AR show up in the browser.
- Realtime: both subscribe to `strokes` inserts; polling every 15 s as backup; local-first with a
  retry queue in `localStorage`.

## Permissions on iOS Safari

Camera, motion/orientation and audio all need a user gesture, so the paint screen starts behind a
single **START PAINTING** button. Add to Home Screen for a full-screen PWA.
