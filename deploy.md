# deploy.md — everything only you can do, in order

Top to bottom, one sitting, about 45 minutes. Steps 1–7 are the ones that matter; the rest is
optional or reference.

**Before you start, have:**

- the Galaxy S25 and a USB data cable
- a Supabase account (free) — <https://supabase.com/dashboard>
- a Google account, only if you want Cloud Anchors in step 5 (also free)
- this repo on the `adarsh-samsung` branch

Android needs **no** paid developer account and no Mac, unlike iOS.

Two things are worth understanding before you type anything:

- **The shared Supabase project is missing the AR columns**, so every AR stroke is refused and
  nothing syncs. That's step 1, it needs no rebuild, and it fixes the iPhone too.
- **The ARCore API key (step 5) has to be in place before you build**, or you build twice.

---

## 1. Your own Supabase project

### 1.1 Create it

1. <https://supabase.com/dashboard> → **New project**.
2. Name it anything (`fresco`), pick the region closest to you (Canada Central / US East for
   Waterloo), and save the database password somewhere — you won't need it for the app, but you
   can't see it again.
3. Wait for it to finish provisioning (~2 min).

### 1.2 Run the SQL, in this order

**SQL Editor** → **New query** → paste the whole file → **Run**. All three are safe to re-run.

| # | File | What it makes |
|---|---|---|
| 1 | `supabase/schema.sql` | `painters`, `canvases`, `strokes`, `reports`, the counter triggers, the RLS policies, the `nearby_canvases` + `increment_views` RPCs, and realtime on `strokes` / `canvases` |
| 2 | `supabase/migration_ar.sql` | **the AR half**: `strokes.anchor_id`, `transform`, `viewer`, the `worldmaps` storage bucket + its policies, `set_world_map`, and the `delete own stroke` policy that undo needs |
| 3 | `supabase/seed.sql` | *optional* — three pieces around E7 so there's something to discover without a second phone |

Skipping file 2 is exactly the state you're in now: painting works locally, uploads fail, nothing
syncs. Don't skip it.

### 1.3 Turn on anonymous sign-in

**Authentication → Providers**:

- **Anonymous sign-ins → enable.** This is the app's normal identity: onboarding creates an
  anonymous user and the painter row is keyed to it.
- **Email → turn off "Confirm email"** (optional). If anonymous sign-in is off, the onboarding
  screen falls back to email + password, and with confirmation on, sign-up waits for a link.

### 1.4 Copy the keys into the app

**Project Settings → API** (newer dashboards call it **API Keys**):

- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **`anon` / publishable key** → `EXPO_PUBLIC_SUPABASE_KEY`

Use the publishable key, never `service_role`. The publishable key is meant to ship in a client;
RLS is what protects writes. `service_role` bypasses RLS entirely — if it ends up in the app
bundle, anyone can read and delete everything.

`.env` in the repo root:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=<your publishable key>
```

`eas.json` → `build.development.env` — the same two values, for cloud builds:

```json
"env": {
  "EXPO_PUBLIC_SUPABASE_URL": "https://<your-ref>.supabase.co",
  "EXPO_PUBLIC_SUPABASE_KEY": "<your publishable key>"
}
```

If Metro is already running, restart it with `npx expo start --dev-client -c`. `-c` matters:
`EXPO_PUBLIC_*` is baked into the bundle at transform time, so a plain reload can keep serving the
old URL from cache. (Starting fresh in step 6? Nothing to restart.)

## 2. PC setup (Windows, once)

Android Studio, the SDK and JDK 17 are already on this machine, and I used them to build the app,
so the only thing missing is the environment variables for your own terminals:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.0.15.6-hotspot"
```

Close and reopen the terminal afterwards — `setx` only affects new ones.

While building I let Gradle install the SDK pieces it needed (Android platform 36, build-tools 36,
NDK 27, CMake). They're in `%LOCALAPPDATA%\Android\Sdk` now; nothing else to install.

## 3. Phone setup (once)

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

## 4. Generate the Android project

```powershell
npm install
npx expo prebuild -p android --no-install
```

This writes the `android/` folder and, with it, the debug keystore that step 5 needs. It takes a
few seconds — it isn't the build.

## 5. Optional: Cloud Anchors, so saved pieces come back exactly

ARCore has no equivalent of ARKit's ARWorldMap, so Android saves a piece as **Cloud Anchors**
(hosted by Google, referenced from a small JSON file in the same Supabase bucket). This is what
makes a piece re-attach to the exact wall spot when you come back.

**Without a key the app still works** — it paints in AR and, on return, shows the piece "placed
from memory · walk to where it was painted", which then snaps onto the wall when ARCore finds a
plane. That's the same fallback the iPhone uses when relocalisation fails. You can add the key
later; it costs you one more build.

To turn it on:

1. Go to <https://console.cloud.google.com/>, create a project (any name).
2. **APIs & Services → Library →** search **ARCore API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict the key (recommended): **Application restrictions → Android apps**, then add
   - package name: `com.hamzakhan.tagged`
   - SHA-1 fingerprint of the debug keystore step 4 just generated:
     ```powershell
     keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android | findstr SHA1
     ```
   Under **API restrictions**, limit it to the ARCore API.
5. Put the key in a **`.env.local`** in the repo root (gitignored, unlike `.env`):
   ```
   ARCORE_API_KEY=AIza...
   ```
6. Fold it into the manifest:
   ```powershell
   npx expo prebuild -p android --no-install
   ```

**Limitation:** an API key caps an anchor's life at **1 day**. Longer (up to a year) needs keyless
OAuth auth, which is a Google Cloud OAuth client plus a small Gradle dependency — worth doing only
if pieces should outlive the demo. Docs:
<https://developers.google.com/ar/develop/java/cloud-anchors/developer-guide-android>

## 6. Build and run

```powershell
npx expo run:android --device
```

The first build takes about 10 minutes; later JS-only changes just reload. After the first install
you can start the dev server on its own:

```powershell
npx expo start --dev-client
```

The phone and PC need to be on the same Wi-Fi. On campus or hackathon Wi-Fi that blocks devices
from reaching each other, either use USB (`adb reverse tcp:8081 tcp:8081`) or `--tunnel`.

Rebuild natively (not just reload) if anything under `modules/`, `targets/`, `app.json` or the
native dependencies changes — including adding the ARCore key later.

## 7. First run, and checking it worked

The Android install is fresh, so there's nothing stale to clear. **On the iPhone**, though, the
saved painter belongs to the *old* project's auth user: open **Profile → gear → Settings → SIGN
OUT** (or **REDO ONBOARDING**) and pick your tag again, or delete and reinstall the app for a
properly clean slate. Queued strokes drain on their own — the backlog the old project kept
refusing is capped at 120 and gets retried against the new one.

Paint one stroke, then check the dashboard:

| Where | What you should see |
|---|---|
| **Table editor → painters** | one row, your tag |
| **Table editor → canvases** | a row at your lat/lng |
| **Table editor → strokes** | a row with `anchor_id` and `transform` **filled in** (not null) |
| **Storage → worldmaps** | ~5 s after you stop painting: `<canvas-id>.arcore.json` from Android (only with step 5 done), or `<canvas-id>.arworldmap` from the iPhone |
| **Metro terminal** | no `uploadStroke failed, queued` warnings |

If those are right, a second phone (or `/world` on the web app) sees your paint live.

## 8. Test it on the phone (do this, don't trust the build)

I could compile everything here but there's no Android device on this machine, so none of the AR
behaviour has run on real hardware. In rough order of what's most likely to need fixing:

1. **Boot:** app opens, onboarding appears, you can sign in and pick a tag.
2. **Create tab:** camera preview appears and the status reads `WALL LOCKED` within a couple of
   seconds of aiming at a textured wall. With the debug HUD on, it should show `compass ready`
   shortly after opening the tab, and `depth` on an S25.
3. **Spray:** hold a colour button and sweep — paint lands on the wall, stays flat when you walk
   sideways and approach at 45°, and doesn't float. A second pass should cover, not haze.
4. **Volume rocker:** holding VOL+ / VOL− sprays, and the Samsung volume panel should *not* appear
   (Android swallows the keys while the Create tab is open). Turn it off in Settings if it
   misbehaves.
5. **Undo and the wall photo:** spray, then undo — the stroke disappears and the wall repaints
   with everyone else's paint intact. A few seconds after spraying, the Vault should show a photo
   of the wall (camera + paint, no reticle or grids).
6. **Compass check:** paint a stroke facing a wall, then look at the piece from the side. If paint
   sits at the wrong angle from a *second* device, the compass calibration is the suspect (§10).
7. **Leave and return:** switch tabs and come back — paint keeps its place (the session resumes).
   Kill the app, reopen within 15 m: with Cloud Anchors the piece resolves; without, it should say
   "placed from memory".
8. **Cross-platform:** paint on Android, then open the same spot on the iPhone (and the reverse).
   Each phone relocalises its own pieces exactly, and shows the other phone's pieces placed from
   the painter's viewpoint — so stand roughly where the other person stood.
9. **Widgets are iPhone-only** — the Android build simply has none.

## 9. Push the branch

I committed the work locally on `adarsh-samsung` but didn't push:

```powershell
git push -u origin adarsh-samsung
```

## 10. Known limits on Android

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

## 11. Troubleshooting

| What you see | What it means |
|---|---|
| `column strokes.anchor_id does not exist` | `migration_ar.sql` wasn't run (step 1.2). Refused strokes pile up in the retry queue |
| `Anonymous sign-ins are disabled` | Step 1.3. Until then onboarding asks for email + password |
| `new row violates row-level security policy` | You're signed out, or the painter row is from the old project — sign out and redo onboarding |
| `Invalid API key` / everything offline | Wrong key, or Metro wasn't restarted with `-c` |
| Paint never reaches another phone | Realtime isn't on those tables — re-run `schema.sql` (the last block adds them to `supabase_realtime`) |
| Undo comes back after a refresh | The `delete own stroke` policy is missing — re-run `migration_ar.sql` |
| `Bucket not found` on world maps | `migration_ar.sql` again — it creates `worldmaps` |
| Create tab shows the compass painter, not AR | Google Play Services for AR isn't installed (step 3.4), or the phone declined the install prompt |
| `Cloud Anchors not configured` in the logs | No ARCore API key — step 5, or ignore it and live with placed-from-memory |
| Camera stays black on the Create tab | Camera permission was denied; grant it in Settings → Apps → Fresco → Permissions |
| `adb devices` shows `unauthorized` | Accept the debugging prompt on the phone; re-plug the cable if it never appeared |

## 12. Extras

**Build in the cloud instead (EAS).** Only if you'd rather not build locally:

```powershell
eas build -p android --profile development   # produces an installable .apk
```

- `app.json` has `"owner": "synaraapp"` and that account's EAS project id, so you need to be a
  member of that Expo account. Otherwise change `owner`, delete `extra.eas.projectId` and run
  `eas init` to make it your own project.
- The ARCore key doesn't come from `.env.local` in the cloud. Add it as an EAS environment
  variable named `ARCORE_API_KEY` (Expo dashboard → project → Environment variables), or drop it
  into `eas.json` next to the Supabase vars.

**The companion website (optional).** `web/` is a separate Vite app with its own variable names —
`web/.env` and `web/.env.production`:

```sh
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_KEY=<your publishable key>
```

If it's deployed on Vercel, set the same two in the project's **Environment Variables** and
redeploy — the values are baked in at build time there too.

**Notes.**

- **Going back** to the old backend is just swapping the two values in `.env` and restarting Metro.
  Keep the old ones in a comment if you want the option during the demo.
- **Painting outside Waterloo**: the geofence is a 25 km circle in `src/config.ts` (`GEOFENCE`).
  Either move it, or flip **Settings → Paint anywhere** on the phone.
- **What doesn't move**: pieces painted against the old project stay there — you can't export from
  a project you don't own. Your own walls still render on your phone from its local cache.
- The App Group used by the widget (`group.com.hamzakhan.tagged` in `src/lib/widget.ts`) is an
  Apple thing, not a Supabase one, and the Android build has no widget at all. On iOS, building
  with `FRESCO_NO_WIDGET=1` (see `app.config.js`) drops the widget target and the App Group
  entitlement, which is what a free Apple "Personal Team" account needs.
