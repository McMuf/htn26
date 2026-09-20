# Run it on the Android phone

Getting Fresco onto the Galaxy S25 with Expo. Ten minutes, most of it on the phone.

The long version — the ARCore key, what to test, known limits — is [goal2.md](goal2.md). This is
just "make it appear on my phone".

---

## You don't need to build it

There is already a debug APK in the repo at `android/app/build/outputs/apk/debug/app-debug.apk`
(101 MB, arm64). It was built before the repo was split into `mobile/` and `web/`, which doesn't
matter: it is a **dev client**, so the ARCore module is compiled into it and the JavaScript is
served by Metro at run time. Install it and it runs today's code.

Note the path: that APK is at the **repo root**, not under `mobile/`. The Expo project itself is
`mobile/`, so the dev server runs from there.

## 1. Set up the phone (once)

1. **Developer options** — Settings → About phone → Software information → tap **Build number**
   seven times.
2. **USB debugging** — Settings → Developer options → turn it on.
3. **Google Play Services for AR** — install it from the Play Store. Without it the Create tab
   quietly falls back to the compass painter instead of ARCore surface tracking. No crash, just
   the older mode, and it's easy to mistake for the AR not working.
4. Plug the phone into the PC with a **data** cable (not a charge-only one) and accept the
   **Allow USB debugging** prompt on the phone.

## 2. Install and run

From the repo root:

```powershell
adb devices        # your phone should be listed as "device", not "unauthorized"
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
cd mobile
npx expo start --dev-client
```

Then open **Fresco** on the phone. It connects to Metro by itself; if it asks for a URL, scan the
QR code the dev server prints.

`mobile/`'s dependencies are already installed, so the dev server starts straight away.

Phone and PC need to be on the same Wi-Fi. On a network that isolates clients (campus, most
hackathon Wi-Fi), either run it over the cable:

```powershell
adb reverse tcp:8081 tcp:8081
```

or start the server with `npx expo start --dev-client --tunnel`.

## 3. Building from scratch

Only needed when native code changes — anything under `mobile/modules/`, `mobile/targets/`,
`mobile/app.json`, the native dependencies, or adding the ARCore API key. JavaScript changes just
reload.

```powershell
cd mobile
npx expo prebuild -p android --no-install   # writes mobile/android/
npx expo run:android --device
```

About ten minutes the first time. Note this writes `mobile/android/`; the root `android/` folder
is the older build tree that the APK above came from.

## When it doesn't work

| What you see | What it means |
|---|---|
| `adb devices` shows nothing | Charge-only cable, or USB debugging is off |
| `adb devices` shows `unauthorized` | The prompt on the phone wasn't accepted — unplug, replug, watch the screen |
| App opens but hangs on a blank screen | Metro isn't reachable: same Wi-Fi, or use `adb reverse` |
| Create tab shows the compass painter, not AR | Google Play Services for AR isn't installed (step 1.3) |
| Camera stays black | Permission was denied — Settings → Apps → Fresco → Permissions |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | An older build with the same package id is installed; `adb uninstall com.hamzakhan.tagged` first |
| Paint uploads fail / nothing syncs | Backend, not Android — see [goal1.md](goal1.md) |

## Once it runs

Worth knowing before you judge it: **none of the AR behaviour has ever run on real hardware.** It
compiles, it boots on an emulator, and that is all anyone can say for it. The Create tab is where
a surprise would show up first.

[goal2.md](goal2.md) §4 has the test list in order of what's most likely to need fixing — wall
locking, spraying, the volume rocker, undo and the wall photo, then the compass check.
