# Run it on the Android phone

Everything needed to get Fresco onto the Galaxy S25 and painting on real walls: phone setup,
installing, the ARCore key for Cloud Anchors, building from scratch, cloud builds, what to test,
and what to do when something looks broken. Self-contained — nothing else to read first.

The backend these builds paint into is already set up; only [goal1.md](goal1.md) covers that, and
only if you ever repoint it at a different Supabase project.

**Where things live since the repo was split:**

| | |
|---|---|
| The Expo app | `mobile/` — every `expo` command runs from there |
| The ARCore module | `mobile/modules/ar-paint/android/` (Kotlin, ~1,900 lines) |
| The website | `web/` — nothing to do with this document |
| An old APK | `android/app/build/outputs/apk/debug/app-debug.apk` at the **repo root** — stale, see §2 |
| A fresh native build | writes `mobile/android/` — a different folder from the one above |

---

## 1. Set up the phone (once)

1. **Developer options** — Settings → About phone → Software information → tap **Build number**
   seven times.
2. **USB debugging** — Settings → Developer options → turn it on.
3. **Google Play Services for AR** — install it from the Play Store. Without it the Create tab
   quietly falls back to the compass painter instead of ARCore surface tracking. No crash, just
   the older mode, which is easy to mistake for "the AR doesn't work".
4. Plug the phone into the PC with a **data** cable (not charge-only) and accept the **Allow USB
   debugging** prompt on the phone.

```powershell
adb devices        # your phone should be listed as "device", not "unauthorized"
```

## 2. Install and run

A dev client has the native modules **compiled in** and pulls the JavaScript from Metro at run
time. So JS changes never need a rebuild — but a *native* dependency added since the last build
does, and the app dies on launch if one is missing rather than degrading.

That is what happened to the old APK at the repo root
(`android/app/build/outputs/apk/debug/app-debug.apk`, built 19 Sep 20:20). Commits later that
evening added `expo-brightness` for the AR brightness boost, so installing it and opening it gives:

```
E ReactNativeJS: [runtime not ready]: Error: Cannot find native module 'ExpoBrightness'
F DEBUG      : Abort message: 'terminating due to uncaught exception ... JavascriptException'
```

— a SIGABRT on the JS thread, straight back to the launcher, with nothing on screen to explain it.
**Build a current one instead.** From `mobile/`:

```powershell
cd mobile
npm install                                 # in case a commit added a dependency
npx expo prebuild -p android --no-install   # writes mobile/android/
npx expo run:android --device SM_S931W      # device NAME from `adb devices -l`, not the serial
```

`--device` takes the `model:` field `adb devices -l` prints. Passing the serial (`RFCY70RR4WB`)
fails with `Could not find device with name`. With exactly one phone attached you can leave the
value off entirely.

That builds, installs and launches it, and starts Metro. To run the dev server separately instead
— useful when you want to restart bundling without rebuilding — add `--no-bundler` to the build
and then:

```powershell
npx expo start --dev-client
```

Then open **Fresco** on the phone. It finds Metro by itself; if it asks for a URL, scan the QR
code the dev server prints.

Phone and PC need to be on the same Wi-Fi. On a network that isolates clients (campus, most
hackathon Wi-Fi), go over the cable instead:

```powershell
adb reverse tcp:8081 tcp:8081
```

or start the server with `npx expo start --dev-client --tunnel`. Over the cable the phone wants
`http://127.0.0.1:8081`, which you can hand it directly:

```powershell
adb shell am start -a android.intent.action.VIEW -d "tagged://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
```

**Rebuild natively whenever a commit touches `modules/`, `targets/`, `app.json`, the native
dependencies, or adds the ARCore key.** After a `git pull`, the tell that you need one is the app
crashing on launch with `Cannot find native module '<Something>'`.

## 2a. The shake gesture, in a development build

Shaking charges the can — and in a **dev** build expo-dev-menu listens for the same gesture and
wins, so you shake the can and get the debug menu. Turn its gesture off once per install:

```powershell
cd mobile
npm run shake:off       # npm run shake:on puts it back
```

You can still open the dev menu from the notification shade, or with
`adb shell input keyevent 82`.

This can't be fixed from app code: expo-dev-menu reads `motionGestureEnabled` from its own
SharedPreferences with a hard-coded `true` default — there's no AndroidManifest meta-data key for
it the way there is for `EXDevMenuShowFloatingActionButton`, and nothing is exposed to JavaScript.
So `scripts/dev_menu_shake.mjs` writes the preference into the app's data directory over adb,
which `run-as` allows because a debug build is debuggable.

It survives `expo run:android` and `adb install -r`; a full **uninstall** wipes app data, so re-run
it after one. **None of this applies to a release build** — the dev menu isn't in that binary and
the shake is yours alone, which is the better answer for a demo.

## 3. The ARCore API key — so saved pieces come back exactly

ARCore has no equivalent of ARKit's ARWorldMap, so on Android a piece is saved as **Cloud
Anchors**: hosted by Google, indexed by a small JSON file in the same Supabase bucket the iPhone
uses. That is what makes a piece re-attach to the exact spot on the wall when you come back.

**Without a key the app still works.** It paints in AR and, on return, shows "placed from memory ·
walk to where it was painted", then snaps onto the wall once ARCore finds a plane — the same
fallback the iPhone uses when relocalisation fails. Adding the key later costs one more build.

I got one step into this and stopped: the Google account hadn't accepted the Google Cloud Platform
terms, and accepting an agreement on your behalf isn't something I'll do. Open
<https://console.cloud.google.com/> once and tick them, then:

1. Create a project (any name).
2. **APIs & Services → Library →** search **ARCore API** → **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict it — **Application restrictions → Android apps** — and add:
   - package name: `com.hamzakhan.tagged`
   - SHA-1 fingerprint, which I read out of the keystore the APK is signed with:
     ```
     5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
     ```
     That is the debug keystore Expo ships in every project, not one unique to you, so this
     restriction keeps honest apps out and little else. Fine for a demo. For anything real,
     generate your own keystore and re-read it with:
     ```powershell
     keytool -list -v -keystore mobile\android\app\debug.keystore -alias androiddebugkey -storepass android -keypass android | findstr SHA1
     ```
   Under **API restrictions**, limit the key to the ARCore API.
5. Put it in **`.env.local`** at the repo root — gitignored, unlike `.env`:
   ```
   ARCORE_API_KEY=AIza...
   ```
6. Fold it into the manifest and rebuild (this is the one step that needs a native build):
   ```powershell
   cd mobile
   npx expo prebuild -p android --no-install
   npx expo run:android --device
   ```

`mobile/modules/ar-paint/app.plugin.js` is what copies the key into the Android manifest at
prebuild time. No key in the environment and it writes nothing, which is why the app still runs
without one.

**Limitation:** an API key caps an anchor's life at **1 day**. Longer — up to a year — needs
keyless OAuth auth, which is a Google Cloud OAuth client plus a small Gradle dependency. Worth it
only if pieces should outlive the demo:
<https://developers.google.com/ar/develop/java/cloud-anchors/developer-guide-android>

## 3a. The Google Maps key — optional, and it fails loudly without one

Explore's heat map uses Google Maps on Android. Unlike most missing config, **it does not degrade:
the Maps SDK throws `RuntimeException: API key not found` while inflating the view**, which takes
the whole app down the instant you open the tab. Nothing reaches JavaScript, so it looks like a
random crash on a menu rather than a missing key. iOS never hits this — react-native-maps uses
Apple Maps there, which needs no key.

So the map is only mounted when it can work. Without a key Android shows a pixel heat view instead
— the same recency-weighted data plotted on bearing and distance from where you stand, with range
rings. It's not a stand-in for a broken map; it's what that tab is on Android until a key exists.

To get the real map, in the **same console as the ARCore key** (§3):

1. **APIs & Services → Library →** enable **Maps SDK for Android**.
2. Make an API key, restricted to **Android apps** with package `com.hamzakhan.tagged` and the
   keystore SHA-1 from §3.
3. Put it in `mobile/.env.local`:
   ```
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
   ```
4. Rebuild — it's a manifest change:
   ```powershell
   cd mobile
   npx expo prebuild -p android --no-install
   npx expo run:android --device SM_S931W
   ```

One variable does both halves: `app.config.js` feeds it to the manifest at prebuild, and
`EXPO_PUBLIC_*` is inlined into the bundle so `HeatMap.tsx` knows whether mounting the map is safe.
Maps keys are client-side by nature — the package + SHA-1 restriction is what protects it, exactly
as with the ARCore key.

## 4. Building from scratch

Needed when native code changes: anything under `mobile/modules/`, `mobile/targets/`,
`mobile/app.json`, the native dependencies, or adding the ARCore key. JavaScript changes just
reload.

```powershell
cd mobile
npx expo prebuild -p android --no-install   # writes mobile/android/
npx expo run:android --device
```

About ten minutes the first time. The machine is already set up for this — Android Studio, the
SDK, JDK 17, and the platform 36 / build-tools / NDK / CMake pieces Gradle pulled down during the
earlier builds. On a *different* PC you would also need:

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17.0.15.6-hotspot"
```

(`setx` only affects new terminals, so reopen yours.)

## 5. Building in the cloud instead (EAS)

```powershell
cd mobile
eas build -p android --profile development   # produces an installable .apk
```

- `mobile/app.json` has `"owner": "synaraapp"` and that account's EAS project id, so you need to
  be a member of that Expo account. Otherwise change `owner`, delete `extra.eas.projectId` and run
  `eas init` to make it your own.
- `.env.local` doesn't travel to the cloud. Add `ARCORE_API_KEY` as an EAS environment variable
  (Expo dashboard → project → Environment variables), or put it in `eas.json` beside the Supabase
  values.

Android builds need **no** paid developer account and no Mac, unlike iOS.

## 6. What to test, in order of what's most likely to break

None of the AR behaviour has ever run on real hardware. It compiles and it boots on an emulator,
and that is all anyone can say for it. So:

1. **Boot** — app opens, onboarding appears, you can pick a tag. It signs in anonymously against
   the shared Supabase project.
2. **Create tab** — camera preview appears and the status reads `WALL LOCKED` within a couple of
   seconds of aiming at a textured wall. With the debug HUD on it shows `compass ready` shortly
   after opening the tab, and `depth` on an S25.
3. **Spray** — hold a colour and sweep. Paint lands on the wall, stays flat as you walk sideways
   and approach at 45°, and doesn't float. A second pass should cover, not haze.
4. **Volume rocker** — holding VOL+ / VOL− sprays, and the Samsung volume panel should *not*
   appear; the module swallows those keys while the Create tab is open. Settings has a toggle if
   it misbehaves.
5. **Undo and the wall photo** — spray, then undo: the stroke goes and the wall repaints with
   everyone else's paint intact. A few seconds after spraying, the Vault should show a photo of
   the wall (camera + paint, no reticle or grids).
6. **Leave and return** — switch tabs and back: paint keeps its place, the session resumes. Kill
   the app and reopen within 15 m: with Cloud Anchors the piece resolves; without, it says "placed
   from memory".
7. **Compass check** — paint facing a wall, then look at the piece from the side. If it sits at
   the wrong angle *from a second device*, compass calibration is the suspect (§7).
8. **Cross-platform** — paint on Android, then open the same spot on the iPhone and the reverse.
   Each phone relocalises its own pieces exactly and shows the other's placed from the painter's
   viewpoint, so stand roughly where they stood.
9. **No widgets on Android.** WidgetKit is iPhone-only; this build simply has none.

## 7. Known limits on Android

- **North alignment is compass-based.** ARKit hands the iPhone a true-north world frame; ARCore
  doesn't, so the module averages the compass against ARCore's yaw for the first ~2 seconds of
  tracking and then locks it. Expect a few degrees of error, more near metal, speakers or a
  laptop. It only matters for sharing paint between devices, not within your own session.
- **Depth, not LiDAR.** The S25 estimates depth from motion, so blank white walls still need a
  slow sweep; textured walls lock in a second or two.
- **Planes only, and only floors and walls.** ARCore will also hand back depth points and oriented
  feature points, and the module used to accept them. Without a time-of-flight sensor that depth is
  inferred from motion, so those hits land on people, glass and chair backs — and they counted as
  "locked", which is how the reticle reported a surface half a metre away while aimed down a
  corridor. They're now rejected: if ARCore hasn't resolved real geometry the reticle stays off and
  the HUD says *aim at a wall or floor*. Ceilings are rejected too. The cost is that a featureless
  wall needs a moment of sweeping before anything locks; the gain is that what locks is real. The
  iPhone keeps its equivalent fallback, because on a LiDAR device the mesh is measured, not
  guessed.
- **Floor pieces painted in the first ~2 seconds**, before the compass locks, can rotate slightly
  when ARCore later refines the floor plane. Walls aren't affected.
- **Cloud Anchors need line-of-sight scanning.** Hosting fails if the wall was barely looked at;
  the app logs it and that piece falls back to placed-from-memory.

## 8. When it doesn't work

| What you see | What it means |
|---|---|
| `adb devices` shows nothing | Charge-only cable, or USB debugging is off |
| `adb devices` shows `unauthorized` | The prompt on the phone wasn't accepted — unplug, replug, watch the screen |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An older build with the same package id is installed: `adb uninstall com.hamzakhan.tagged` first |
| App opens but hangs on a blank screen | Metro isn't reachable — same Wi-Fi, or use `adb reverse tcp:8081 tcp:8081` |
| App closes instantly; logcat says `Cannot find native module '…'` | The installed dev client predates a commit that added a native dependency — rebuild (§2) |
| Metro says `Unable to resolve module …` | A commit added a JS dependency: `npm install` in `mobile/`, then restart Metro with `--clear` |
| `Port 8081 is being used by another process` | An earlier Metro is still alive. `Get-NetTCPConnection -LocalPort 8081 -State Listen` gives the PID for `Stop-Process` |
| `Could not find device with name: RFCY70RR4WB` | `--device` wants the `model:` name from `adb devices -l` (`SM_S931W`), not the serial |
| Create tab shows the compass painter, not AR | Google Play Services for AR isn't installed (§1.3), or the install prompt was declined |
| Camera stays black on the Create tab | Camera permission denied — Settings → Apps → Fresco → Permissions |
| `Cloud Anchors not configured` in the logs | No ARCore API key — §3, or live with placed-from-memory |
| Volume keys change the volume instead of spraying | The interceptor isn't installed; toggle **Volume buttons also spray** off and on in Settings |
| Shaking opens the dev menu instead of charging the can | expo-dev-menu owns that gesture in a dev build — `npm run shake:off` (§2a) |
| App dies opening Explore, nothing in the Metro log | Google Maps with no API key — a native throw, so JS never sees it (§3a). Fixed: the map only mounts when a key exists |
| Reticle won't lock on a wall you're facing | By design since the depth-point fallback was removed (§7): ARCore needs an actual plane. Sweep the wall slowly; a blank one takes a few seconds |
| Paint is faint or hazy | Shouldn't happen — a Skia paint-alpha bug that did exactly this was fixed. If you see it, say so |
| Strokes don't reach the iPhone | Backend, not Android — [goal1.md](goal1.md) |
| Gradle can't find the SDK on a new PC | `ANDROID_HOME` / `JAVA_HOME` aren't set — §4 |

## 9. What the Android build actually is

`mobile/modules/ar-paint` has a Kotlin/ARCore implementation behind the same module interface as
the Swift one, so every screen, the spray model and the stroke format are shared with the iPhone:
horizontal and vertical plane detection plus the Depth API, paint quads on ARCore anchors with
plane snapping, a compass-derived north-aligned frame in place of ARKit's `gravityAndHeading`,
Cloud Anchors in place of ARWorldMap, undo and wall photos, and the volume rocker as a real
trigger with no release lag. The per-platform comparison table is in `README.md`; the deeper
notes are in [goal2.md](goal2.md).
