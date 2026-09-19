# deploy.md — the steps only you can do

Two independent parts:

- **Part A — run Fresco on Android (Galaxy S25):** building the app onto your phone.
- **Part B — point Fresco at your own Supabase:** the shared project is missing the AR columns, so
  AR strokes are refused and nothing syncs. This affects the iPhone too.

If paint isn't syncing, do Part B first — it needs no rebuild.

---

# Part A — run Fresco on Android (Galaxy S25)

Everything in this file is a step **you** have to do: things that need your phone, your Google
account, or a login I don't have. The code changes are already on the `adarsh-samsung` branch.

The short version, if your PC is already set up:

```powershell
npm install
npx expo run:android --device     # phone plugged in over USB
```

That gives you the real ARCore painter. Cloud Anchors (A4) are optional and only affect whether a
saved piece reappears on the exact wall spot or "from memory".

---

## A1. One-time PC setup (Windows)

Android Studio, the SDK and JDK 17 are already on this machine, and I used them to build the app,
so the only thing missing is the environment variables for your own terminals:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.0.15.6-hotspot"
```

Close and reopen the terminal afterwards — `setx` only affects new ones.

While building I let Gradle install the SDK pieces it needed (Android platform 36, build-tools 36,
NDK 27, CMake). They're in `%LOCALAPPDATA%\Android\Sdk` now; nothing else to install.

## A2. One-time phone setup (S25)

1. **Developer options:** Settings → About phone → Software information → tap **Build number**
   seven times.
2. **USB debugging:** Settings → Developer options → turn on **USB debugging**.
3. Plug the phone into the PC with a data cable and accept **Allow USB debugging** on the phone.
   Check the PC sees it:
   ```powershell
   adb devices        # should list your phone as "device", not "unauthorized"
   ```
4. **Google Play Services for AR:** the S25 supports ARCore, but the AR service app may not be
   installed. The app asks for it on first launch of the Create tab, or install it ahead of time
   from the Play Store ("Google Play Services for AR"). Without it, Fresco falls back to the
   compass painter instead of real surface tracking — no crash, just the older mode.

## A3. Build and run

```powershell
npm install
npx expo run:android --device
```

The first build takes about 10 minutes; later JS-only changes just reload. After the first
install you can start the dev server on its own:

```powershell
npx expo start --dev-client
```

The phone and PC need to be on the same Wi-Fi. On campus or hackathon Wi-Fi that blocks devices
from reaching each other, either use USB (`adb reverse tcp:8081 tcp:8081`) or `--tunnel`.

Rebuild natively (not just reload) if anything under `modules/`, `targets/`, `app.json` or the
native dependencies changes.

## A4. Optional: Cloud Anchors, so saved pieces come back exactly

ARCore has no equivalent of ARKit's ARWorldMap, so Android saves a piece as **Cloud Anchors**
(hosted by Google, referenced from a small JSON file in the same Supabase bucket). This is what
makes a piece re-attach to the exact wall spot when you come back.

**Without a key, the app still works** — it paints in AR and, on return, shows the piece "placed
from memory · walk to where it was painted", which then snaps onto the wall when ARCore finds a
plane. That's the same fallback the iPhone uses when relocalisation fails.

To turn it on:

1. Go to <https://console.cloud.google.com/>, create a project (any name).
2. **APIs & Services → Library →** search **ARCore API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict the key (recommended): **Application restrictions → Android apps**, then add
   - package name: `com.hamzakhan.tagged`
   - SHA-1 fingerprint of the debug keystore:
     ```powershell
     keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android | findstr SHA1
     ```
   Under **API restrictions**, limit it to the ARCore API.
5. Put the key in a **`.env.local`** in the repo root (gitignored, unlike `.env`):
   ```
   ARCORE_API_KEY=AIza...
   ```
6. Rebuild so it lands in the manifest:
   ```powershell
   npx expo prebuild -p android --no-install
   npx expo run:android --device
   ```

Check it worked: the app's Create tab writes `map <something>` in the debug line, and saving a
piece no longer logs `Cloud Anchors not configured`.

**Limitation:** an API key caps an anchor's life at **1 day**. Longer (up to a year) needs keyless
OAuth auth, which is a Google Cloud OAuth client plus a small Gradle dependency — worth doing only
if pieces should outlive the demo. Docs:
<https://developers.google.com/ar/develop/java/cloud-anchors/developer-guide-android>

## A5. Alternative: build in the cloud with EAS

Only needed if you'd rather not build locally:

```powershell
eas build -p android --profile development   # now produces an installable .apk
```

Two things to know:
- `app.json` has `"owner": "synaraapp"` and that account's EAS project id, so you need to be a
  member of that Expo account. Otherwise change `owner`, delete `extra.eas.projectId` and run
  `eas init` to make it your own project.
- The ARCore key doesn't come from `.env.local` in the cloud. Add it as an EAS environment
  variable named `ARCORE_API_KEY` (Expo dashboard → project → Environment variables), or drop it
  into `eas.json` next to the Supabase vars.

Android builds need **no** paid developer account, unlike iOS.

## A6. Supabase

Nothing Android-specific to run: it reuses the existing `worldmaps` bucket, the `set_world_map`
RPC and the same tables, and its map file (`<canvas>.arcore.json`) sits next to the iPhone's
`<canvas>.arworldmap` in a bucket with no file-type restriction.

But AR sync is broken on the shared project for *both* platforms until the AR migration is run —
that's **Part B** below, and it's worth doing first.

## A7. Push the branch

I committed the work locally on `adarsh-samsung` but didn't push:

```powershell
git push -u origin adarsh-samsung
```

## A8. Test it on the phone (do this, don't trust the build)

I could compile everything here but there's no Android device on this machine, so none of it has
run on real hardware. In rough order of what's most likely to need fixing:

1. **Boot:** app opens, onboarding appears, you can sign in and pick a tag.
2. **Create tab:** camera preview appears and the chip reads `WALL LOCKED` within a couple of
   seconds of aiming at a textured wall. The debug line should show `compass ready` shortly after
   opening the tab, and `depth` on an S25.
3. **Spray:** hold an on-screen button and sweep — paint lands on the wall, stays flat when you
   walk sideways and approach at 45°, and doesn't float. Dwell on a spot to get a drip.
4. **Volume rocker:** holding VOL+ / VOL− sprays, and the Samsung volume panel should *not* appear
   (Android swallows the keys while the Create tab is open). Turn it off in Settings if it's
   annoying.
5. **Aim the compass check:** paint a stroke facing a wall, then look at the piece from the side.
   If paint sits at the wrong angle from a *second* device, the compass calibration is the suspect
   (see A9).
6. **Leave and return:** switch tabs and come back — paint keeps its place (the session resumes).
   Kill the app, reopen within 15 m: with Cloud Anchors the piece resolves; without, it should say
   "placed from memory".
7. **Cross-platform:** paint on Android, then open the same spot on the iPhone (and the reverse).
   Each phone relocalises its own pieces exactly, and shows the other phone's pieces placed from
   the painter's viewpoint — so stand roughly where the other person stood.
8. **Widgets are iPhone-only** — the Android build simply has none.

## A9. Known limits on Android

- **North alignment is compass-based.** ARKit gives the iPhone a true-north world frame for free;
  ARCore doesn't, so the module averages the compass against ARCore's yaw for the first ~2 seconds
  of tracking and then locks it. Expect a few degrees of error, and more near metal, speakers or
  a laptop. It only matters for sharing paint between devices, not for your own session.
- **Depth, not LiDAR.** The S25 estimates depth from motion, so blank white walls still need a
  slow sweep; textured walls lock in a second or two.
- **Floor pieces painted in the first ~2 seconds** (before the compass locks) can rotate slightly
  when ARCore later refines the floor plane. Walls aren't affected.
- **Cloud Anchors need line-of-sight scanning.** Hosting fails if the wall was barely looked at —
  the app logs it and the piece falls back to placed-from-memory.
- **Glass panels don't blur on Android** (expo-blur needs an explicit blur target there); they're
  a denser tint instead. Cosmetic.

---

# Part B — point Fresco at your own Supabase

The app currently talks to someone else's Supabase project, which is why AR paint doesn't sync:
that project is missing the `anchor_id` column, so every AR stroke is refused. Your own project
takes about ten minutes to set up and you can run the migrations yourself.

Nothing here needs a native rebuild. The keys are read from `.env` when Metro bundles, so a
restart is enough.

---

## B1. Create the project

1. <https://supabase.com/dashboard> → **New project**.
2. Name it anything (`fresco`), pick the region closest to you (Canada Central / US East for
   Waterloo), and save the database password somewhere — you won't need it for the app, but you
   can't see it again.
3. Wait for it to finish provisioning (~2 min).

## B2. Run the SQL, in this order

**SQL Editor** → **New query** → paste the whole file → **Run**. All three are safe to re-run.

| # | File | What it makes |
|---|---|---|
| 1 | `supabase/schema.sql` | `painters`, `canvases`, `strokes`, `reports`, the counter triggers, the RLS policies, the `nearby_canvases` + `increment_views` RPCs, and realtime on `strokes` / `canvases` |
| 2 | `supabase/migration_ar.sql` | **the AR half**: `strokes.anchor_id`, `transform`, `viewer`, the `worldmaps` storage bucket + its policies, `set_world_map`, and the `delete own stroke` policy that undo needs |
| 3 | `supabase/seed.sql` | *optional* — three pieces around E7 so there's something to discover without a second phone |

Skipping step 2 is exactly the state you're in now: painting works locally, uploads fail, nothing
syncs. Don't skip it.

## B3. Turn on anonymous sign-in

**Authentication → Providers**:

- **Anonymous sign-ins → enable.** This is the app's normal identity: onboarding creates an
  anonymous user and the painter row is keyed to it.
- **Email → turn off "Confirm email"** (optional). If anonymous sign-in is off, the onboarding
  screen falls back to email + password, and with confirmation on, sign-up waits for a link.

## B4. Copy the keys

**Project Settings → API** (newer dashboards call it **API Keys**):

- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **`anon` / publishable key** → `EXPO_PUBLIC_SUPABASE_KEY`

Use the publishable key, never `service_role`. The publishable key is meant to ship in a client;
RLS is what protects writes. `service_role` bypasses RLS entirely — if it ends up in the app
bundle, anyone can read and delete everything.

## B5. Point the app at it

`.env` in the repo root:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<your publishable key>
```

`eas.json` → `build.development.env` — same two values, for cloud builds:

```json
"env": {
  "EXPO_PUBLIC_SUPABASE_URL": "https://<your-ref>.supabase.co",
  "EXPO_PUBLIC_SUPABASE_KEY": "<your publishable key>"
}
```

Then restart Metro so the new values get inlined:

```sh
npx expo start --dev-client -c
```

`-c` matters. `EXPO_PUBLIC_*` is baked into the bundle at transform time, so a plain reload can
keep serving the old URL from cache.

## B6. First run on the phone

Your saved painter belongs to the *old* project's auth user, so:

1. Open the app → **Profile → gear → Settings → SIGN OUT** (or **REDO ONBOARDING**).
2. Pick your tag again. That writes a fresh `painters` row in your project.

For a properly clean slate (old cached canvases still show in Explore / Vault otherwise), delete
the app from the phone and reinstall the dev client instead.

Queued strokes drain on their own: the backlog the old project kept refusing is capped at 120 and
gets retried against the new one, which now has the right columns.

## B7. Check it worked

Paint one stroke, then in the dashboard:

| Where | What you should see |
|---|---|
| **Table editor → painters** | one row, your tag |
| **Table editor → canvases** | a row at your lat/lng |
| **Table editor → strokes** | a row with `anchor_id` and `transform` **filled in** (not null) |
| **Storage → worldmaps** | a `<canvas-id>.arworldmap` file, ~5 s after you stop painting |
| **Metro terminal** | no `uploadStroke failed, queued` warnings |

If all five are right, a second phone (or `/world` on the web app) sees your paint live.

## B8. The companion website (optional)

`web/` is a separate Vite app with its own variable names — `web/.env` and `web/.env.production`:

```sh
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_KEY=<your publishable key>
```

If it's deployed on Vercel, set the same two in the project's **Environment Variables** and
redeploy — the values are baked in at build time there too.

## B9. Troubleshooting

| What you see | What it means |
|---|---|
| `column strokes.anchor_id does not exist` | `migration_ar.sql` wasn't run. This is what was crashing the app: refused strokes pile up in the retry queue |
| `Anonymous sign-ins are disabled` | Step 3. Until then onboarding asks for email + password |
| `new row violates row-level security policy` | You're signed out, or the painter row is from the old project — sign out and redo onboarding |
| `Invalid API key` / everything offline | Wrong key, or Metro wasn't restarted with `-c` |
| Paint never reaches another phone | Realtime isn't on those tables — re-run `schema.sql` (the last block adds them to `supabase_realtime`) |
| Undo comes back after a refresh | The `delete own stroke` policy is missing — re-run `migration_ar.sql` |
| `Bucket not found` on world maps | `migration_ar.sql` again — it creates `worldmaps` |

## B10. Notes

- **Going back** is just swapping the two values in `.env` and restarting Metro. Keep the old ones
  in a comment if you want the option during the demo.
- **Painting outside Waterloo**: the geofence is a 25 km circle in `src/config.ts` (`GEOFENCE`).
  Either move it, or flip **Settings → Paint anywhere** on the phone.
- **What doesn't move**: pieces painted against the old project stay there — you can't export from
  a project you don't own. Your own walls still render on your phone from its local cache.
- The App Group used by the widget (`group.com.hamzakhan.tagged` in `src/lib/widget.ts`) is an
  Apple thing, not a Supabase one. Your builds set `FRESCO_NO_WIDGET=1`, so it isn't used.
