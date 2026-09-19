# deploy.md — running Fresco on Android (Galaxy S25)

Everything in this file is a step **you** have to do: things that need your phone, your Google
account, or a login I don't have. The code changes are already on the `adarsh-samsung` branch.

The short version, if your PC is already set up:

```powershell
npm install
npx expo run:android --device     # phone plugged in over USB
```

That gives you the real ARCore painter. Cloud Anchors (§4) are optional and only affect whether a
saved piece reappears on the exact wall spot or "from memory".

---

## 1. One-time PC setup (Windows)

Android Studio, the SDK and JDK 17 are already on this machine, and I used them to build the app,
so the only thing missing is the environment variables for your own terminals:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.0.15.6-hotspot"
```

Close and reopen the terminal afterwards — `setx` only affects new ones.

While building I let Gradle install the SDK pieces it needed (Android platform 36, build-tools 36,
NDK 27, CMake). They're in `%LOCALAPPDATA%\Android\Sdk` now; nothing else to install.

## 2. One-time phone setup (S25)

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

## 3. Build and run

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

## 4. Optional: Cloud Anchors, so saved pieces come back exactly

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

## 5. Alternative: build in the cloud with EAS

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

## 6. Supabase

Nothing to run. Android reuses the existing `worldmaps` bucket, the `set_world_map` RPC and the
same tables; its map file is `<canvas>.arcore.json` next to the iPhone's `<canvas>.arworldmap`,
and the bucket has no file-type restriction.

If you ever point the app at a fresh Supabase project, it's still the README's list:
`supabase/schema.sql`, then `supabase/seed.sql`, then `supabase/migration_ar.sql`, plus
Authentication → Providers → enable **Anonymous sign-ins** and disable **Confirm email**.

## 7. Push the branch

I committed the work locally on `adarsh-samsung` but didn't push:

```powershell
git push -u origin adarsh-samsung
```

## 8. Test it on the phone (do this, don't trust the build)

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
   (see §9).
6. **Leave and return:** switch tabs and come back — paint keeps its place (the session resumes).
   Kill the app, reopen within 15 m: with Cloud Anchors the piece resolves; without, it should say
   "placed from memory".
7. **Cross-platform:** paint on Android, then open the same spot on the iPhone (and the reverse).
   Each phone relocalises its own pieces exactly, and shows the other phone's pieces placed from
   the painter's viewpoint — so stand roughly where the other person stood.
8. **Widgets are iPhone-only** — the Android build simply has none.

## 9. Known limits on Android

- **North alignment is compass-based.** ARKit gives the iPhone a true-north world frame for free;
  ARCore doesn't, so the module averages the compass against ARCore's yaw for the first ~2 seconds
  of tracking and then locks it. Expect a few degrees of error, and more near metal, speakers or
  a laptop. It only matters for sharing paint between devices, not for your own session.
- **Depth, not LiDAR.** The S25 estimates depth from motion, so blank white walls still need a
  slow sweep; textured walls lock in a second or two.
- **Cloud Anchors need line-of-sight scanning.** Hosting fails if the wall was barely looked at —
  the app logs it and the piece falls back to placed-from-memory.
- **Glass panels don't blur on Android** (expo-blur needs an explicit blur target there); they're
  a denser tint instead. Cosmetic.
