# Goal 1 — two phones painting the same wall

**Done when:** you paint on phone A and it shows up on phone B (or on the website) within a couple
of seconds, and walking up to someone else's piece later still shows it.

This goal is about the **backend and sharing**. It doesn't need the Android build at all — an
iPhone plus the website is enough to finish it. The Android app is [goal2.md](goal2.md).

---

## Where it stands

| | |
|---|---|
| Supabase project | **done** — `xevbnegilqjyjzxhrcwo`, yours |
| Schema + AR migration + seed | **done**, one paste of `supabase/setup_all.sql` |
| Anonymous sign-in | **done** (needed a *Save changes* click the dashboard hides below the fold) |
| Keys wired into the app, website and EAS | **done**, committed |
| Verified from here | all six checks pass, see below |
| **Left for you** | restart Metro, redo onboarding on the iPhone, run the two-client test |

The old shared project was missing the AR columns — every AR stroke was refused, which is why
nothing ever synced. That's fixed: the app now points at your own project.

```
ok  schema.sql ran (strokes table reachable)
ok  migration_ar.sql ran (anchor_id, transform, viewer)
ok  canvases carry a world map pointer
ok  nearby_canvases RPC exists
ok  worldmaps storage bucket exists
ok  anonymous sign-in enabled
```

Re-run any time with `npm run supabase:check` (add `--anon` to include the sign-in test, which
creates one throwaway user).

## What has to be true for paint to travel

Worth knowing, because every failure below is one broken link in this chain:

1. Both clients are signed in against **the same project** — that's `.env` plus a Metro restart.
2. Both are standing within **15 m of the same canvas** (`CANVAS_JOIN_RADIUS_M`), otherwise phone B
   starts its own canvas instead of joining yours.
3. The stroke **inserts** into `strokes` (needs the AR columns, and RLS needs `author_id` to be
   your signed-in user).
4. **Realtime** delivers the insert to the other client; a 15-second poll is the backup.
5. The other client **renders** it — how accurately is the AR question, see the table further down.

## Step 1 — point the phones at the backend

The keys are already in `.env`. They're inlined when Metro bundles, so:

```powershell
npx expo start --dev-client -c
```

`-c` matters. Without it Metro can serve a cached bundle still carrying the old project's URL.

**On each iPhone that already has the app**, the saved painter belongs to the *old* project's auth
user, so it can't write to yours: open **Profile → gear → Settings → SIGN OUT** (or **REDO
ONBOARDING**) and pick your tag again. Deleting and reinstalling gives a properly clean slate —
otherwise old cached canvases still show in Explore and Vault.

Queued strokes drain on their own: the backlog the old project kept refusing is capped at 120 and
gets retried against the new one.

## Step 2 — the two-client test

You don't need two phones for most of this. The website talks to the same project, so it works as
the second client.

**With one phone + the website**

1. Phone: paint a stroke.
2. Open the site's `/world` on any browser. Your canvas appears as a marker, with the paint drawn
   into it, within a few seconds.
3. Open `/paint` on a second browser (or a laptop) standing in the same place and paint — the
   phone should pick that stroke up live.

**With two phones** (the real test)

1. Both phones open the app, **standing within 15 m of each other**.
2. Phone A paints. Phone B should show the stroke within a second or two without either of you
   touching anything.
3. Phone B paints on the same wall; phone A gets it back.
4. Walk away and return: the piece is still there, and the first person to arrive who hasn't seen
   it gets the discovery beat — shimmer, then "YOU FOUND A PIECE", and `views` ticks up.

If both phones are iPhones this is the exact-placement case. Mixed iPhone/Android is looser — the
table below says how much.

## Step 3 — check the dashboard

After one stroke:

| Where | What you should see |
|---|---|
| **Table editor → painters** | one row per tag |
| **Table editor → canvases** | a row at your lat/lng |
| **Table editor → strokes** | a row with `anchor_id` and `transform` **filled in**, not null |
| **Storage → worldmaps** | ~5 s after you stop painting: `<canvas-id>.arworldmap` from an iPhone (Android writes `.arcore.json`, and only with its API key set up — goal 2) |
| **Metro terminal** | no `uploadStroke failed, queued` warnings |

The three seed pieces around E7 are already in `canvases`, so Explore has something in it before
you paint anything.

## What "sharing" actually gives you

Strokes always sync. Where they *land* depends on the pair of clients:

| Painter → viewer | What the viewer sees |
|---|---|
| iPhone → iPhone, same spot, map resolves | Paint on the exact wall spot. This is the ARWorldMap path |
| iPhone → iPhone, map fails to resolve (15 s) | "Piece placed from memory · walk to where it was painted", then it snaps onto a detected wall |
| iPhone ↔ Android | Always the placed-from-memory path: each platform only relocalises its own maps. Stand roughly where the painter stood |
| Either phone → website | Direction-accurate: the site projects AR strokes onto its compass sphere. Good for judging, not for placement |
| Website → phone | Compass strokes render as an overlay on the AR view |
| Live, while both paint | Realtime insert, so a second or two; 15-second polling if realtime drops |

**Distances that matter** (`src/config.ts`): join a canvas within **15 m**, paint renders from
**35 m**, the pull/shimmer starts at **80 m**, a piece counts as discovered inside **14 m**, and
the app fetches canvases within **600 m**. Painting at all requires being inside the **25 km**
Waterloo geofence — flip **Settings → Paint anywhere** to test elsewhere.

## Troubleshooting

| What you see | What it means |
|---|---|
| `column strokes.anchor_id does not exist` | Pointed at a project without the AR migration. Paste `supabase/setup_all.sql` |
| `Anonymous sign-ins are disabled` | The toggle didn't save — the dashboard needs **Save changes** at the bottom of Sign In / Providers |
| `new row violates row-level security policy` | Signed out, or the painter row belongs to the old project — sign out and redo onboarding |
| `Invalid API key` / everything offline | Wrong key, or Metro wasn't restarted with `-c` |
| Paint never reaches the other client | Realtime isn't on those tables — re-run `schema.sql`; its last block adds them to `supabase_realtime` |
| Two phones each paint their own canvas | You're more than 15 m apart, or GPS accuracy is poor indoors — check the accuracy readout in the debug HUD |
| Undo comes back after a refresh | The `delete own stroke` policy is missing — re-run `migration_ar.sql` |
| `Bucket not found` on world maps | Same file — it creates `worldmaps` |
| Strokes upload but the piece is in the wrong place | That's placement, not sync. See the table above, and goal 2 §5 for the Android compass limits |

## If you ever point at a different project

1. <https://supabase.com/dashboard> → **New project**. Any name, the region closest to you
   (Canada Central / US East for Waterloo); save the database password somewhere, you won't need
   it for the app but you can't see it again. Provisioning takes ~2 min.
2. **SQL Editor → New query →** paste `supabase/setup_all.sql` → **Run**. It will warn about
   destructive statements (`drop policy if exists`, the seed's cleanup `delete`); on a fresh
   project there's nothing to lose. (`node scripts/gen_setup_sql.mjs` rebuilds that file if you
   edit `schema.sql`, `migration_ar.sql` or `seed.sql`.)
3. **Authentication → Sign In / Providers →** turn on **Allow anonymous sign-ins**, then scroll
   down and press **Save changes**. Optionally turn **Confirm email** off too: if anonymous
   sign-in is ever disabled, onboarding falls back to email + password, and with confirmation on
   that waits for an emailed link.
4. **Project Settings → API Keys →** copy the **publishable** key. Never `service_role`: the
   publishable key is meant to ship in a client and RLS is what protects writes, while
   `service_role` bypasses RLS entirely — in an app bundle it lets anyone read and delete
   everything.
5. ```powershell
   node scripts/use_supabase.mjs https://<ref>.supabase.co <publishable key>
   ```
   That writes `.env`, `web/.env`, `web/.env.production` and `eas.json`, then re-runs the checks.
   By hand instead: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_KEY` in `.env` and under
   `eas.json` → `build.development.env`, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` in
   `web/.env` and `web/.env.production`.
6. Restart Metro with `-c`, and sign out / redo onboarding on each phone.

**Going back** to the old backend is just swapping the two values in `.env` and restarting Metro —
keep them in a comment if you want the option during the demo. **What doesn't move:** pieces
painted against the old project stay there, since you can't export from a project you don't own.
Your own walls still render on your phone from its local cache.

## The companion website

`web/` is a separate Vite app with its own variable names, already pointed at your project:

```sh
VITE_SUPABASE_URL=https://xevbnegilqjyjzxhrcwo.supabase.co
VITE_SUPABASE_KEY=<publishable key>
```

If it's deployed on Vercel, set those two in the project's **Environment Variables** and redeploy —
they're baked in at build time there too. Until you do, the deployed site still reads the old
project and will look empty next to your phone.
