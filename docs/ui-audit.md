# UI + Expo audit — Cospray mobile (`mobile/`), branch point `main@a49a67d`

Short version: the app has one *intended* look (pixel arcade: purple base, notched `PixelBox` slabs,
Pixelify/VT323 type, hard shadows, no blur) but it is applied unevenly, four dead screens and the
widget still wear the previous dark-neon theme, and every tab invents its own colours. The launch
globe is the weakest screen.

## 1. Screens — what each one uses today

| Screen | Reached from | Backdrop tone | Off-token colours (count) | Type drift | Radius / blur / gradient | Haptics | Press feedback | Verdict |
|---|---|---|---|---|---|---|---|---|
| Launch | `App.tsx` | `night` | 5 (`#1b2440 #0a0d1c #03040a` sphere, `#fff`, `#4a22b8`) | wordmark 56/ls 8 (Onboarding uses ls 6) | Skia `BlurMask` ×3, `RadialGradient` | `impactAsync(Medium)` **ungated** | whole-screen `Pressable`, none | thin 1px wireframe, `setState` every frame (rebuilds 1.7k-pt paths on JS), plain "F" disc as logo → **redo** |
| Onboarding | `App.tsx` | own `ScrollView` + `#12082b` | 8 (`#150a36` field, `#111111`, `#ffffff22`, `#4a22b8`, `#fff`×4) | brand ls 6; `F.display` inputs | none | `Success`/`selection` **ungated** | swatches: none | own scaffolding (padding 20/64) ≠ kit `Screen` (18/62); 3 disabled grey social slabs |
| Profile | tab | `purple` | 6 (`#c48f00`×3, `#1f4fa8/#2b63c8/#173f88`, `#12306b`, `#150a36`, `#fff`) | `F.display` 16/17 inline | none | claim `Success` **ungated** | Pill: none | **reference palette** — but two blues on one panel (`TONES.blue` panel vs `#1f4fa8` cards) |
| Vault | tab | `terminal` (green) | 3 (`#0f2a22/#1d4a3a/#0a1c17` card, `#0a0620cc`, `#fff`) | label 10.5 vs kit 11.5 | none | none | grid cards: none | green-on-green looks like a different app; empty state is a purple panel on green |
| Explore | tab | `terminal` | 5 (same green card triple, `#03100b`, `#160b36`, `#fff`) | label 10.5 | none | none | cards/rows: none | Apple Maps tiles in a pixel frame; fullscreen map modal has no backdrop |
| Social | tab | `magenta` | 20+ (`#6a1a78/#2a0d3f/#150626` gradients, `#2b2059`, `#c9b8ff`, `#6a5aa8`, `#e6dcff`, `#bdaee8`, `#ffffff18/26`, `#c48f00`, `#2a1a00`, `#fff`…) | 62px ls −1 heading; lowercase "fresco" 22 | `LinearGradient` ×3, `borderRadius` capsule + 14 | share `impactAsync` **ungated** | via kit | the share card is a rounded gradient "Airbuds" card — **the biggest outlier among live screens** |
| Market (sheet) | Profile / tools tray | `blue` | 6 (`#22449a/#3560c8/#183578`, `#152b66`, `#bcd0ff`, `#150a36`, `#c48f00`) | `F.display` 16/18 inline | none | buy `Success` **ungated** | via kit | third blue triple in the app; CRT bands under an iOS rounded sheet corner |
| Settings (sheet) | Profile | `purple` | 2 (`#fff`) | all system | none | via kit | link row: none | fine; Toggle knob jumps (no spring); sign-out sits inside the debug panel; link still says tagged-web |
| Create — HUD | Paint/ArPaint | camera | 20+ `#fff`/`#ffffffNN`, `#3a2a78`, `#5a44a8`, `#b9aee0`, `#1f1348`, `#000a` | `F.display` 17/18 inline | reticle `borderRadius 22` (round) | gated | mixed: `useState(down)` and render-prop `pressed` | deliberately colourless (good); round reticle is the one rounded control |
| Create — Discovery overlay | Paint/ArPaint | camera | `#fff`×5, `#b9aee0` | ok | none | gated | VIEW: none | consistent with HUD |
| PieceDetail (SpatialViewer) | Vault/Explore/Create | none (flat `#150a36`) | 15 (`#3b1a8a`, `#4b3e82`, `#332a63`, `#2b1a66`, `#35227a`, `#3f2a86`, `#22124f`, `#fff3a8`, `#ffd21f`, `#57ffa0`, `#160b36`, `#0a062088`…) | ok | none | via kit | via kit | bricks here ≠ `StrokeThumb` bricks; no backdrop |
| PaintScreen (non-ARKit) | `App.tsx` | none | `#000`, `#12082b`, `#fff` | `F.body` | none | engine | — | permission view is a bare flat view |
| Dock | root | — | `#4327a8`, `#0d062b`, `#2a1a00`, `#7a5200`, `#6f5fb0` | ok | none | gated | CREATE key squash; side items lift only | fine — this is the idiom to extend |
| Widget (`targets/widget`) | home screen | — | `#0b0b0f` bg, `#ff2d95` accent, `#7cff3a`, `#ff5c1a`, `#19e6ff` | system | 14 rounded | — | — | **previous theme entirely** |

Dead (not imported anywhere): `src/screens/AuthScreen.tsx`, `NameScreen.tsx`, `LeaderboardScreen.tsx`,
`MapScreen.tsx` (all "TAGGED", `#0b0b0f`/`#ff2d95`/`#19e6ff`, radius 14), `src/ui/Glass.tsx` (stub that
ignores its props), `expo-blur` (installed, never imported), Silkscreen + Pixelify 400/600 (loaded in
`App.tsx`, referenced 0×).

## 2. Where the theme diverges from itself

- **Two accent systems** in `theme.ts`: arcade (`green yellow red blue purple pink phosphor`) and the
  "legacy" neons (`cyan lime orange violet`) — `C.orange` still live in Profile/Social, `C.phosphor`
  is the Vault/Explore/Launch accent. Paint palette (`config.ts PALETTE`) and UI accents drifted apart
  (`#ffe600` vs `#ffd21f`, `#ff2d95` vs `#ff4fa3`).
- **Literals that duplicate a token**: `#c48f00`=yellowLo (6×), `#2a1a00`=yellow ink (9×),
  `#4a22b8`=purpleLo (2×), `#12082b`=bg (2×), `#150626`/`#03100b`=backdrop bottoms (5×),
  `#3a2a78`=dark.hi (2×), `#b9aee0`=white.lo (2×), `#ffd21f`=yellow (3×), `#fff`/`#ffffff` ≈ 60×.
- **Fills that exist only as literals** (need tokens): terminal card `#0f2a22/#1d4a3a/#0a1c17`, mission
  blue `#1f4fa8/#2b63c8/#173f88`+`#12306b`, market blue `#22449a/#3560c8/#183578`+`#152b66`, deep plate
  `#160b36`, well `#150a36`, tile `#2b2059/#3a2d78/#1c1440`, tray key `#1f1348`.
- **Type**: `T v="label"` defaults to yellow so screens override it ad hoc; card titles are 16/17/18/20
  depending on the file; `uiLabel` is called with 7 different sizes; wordmark tracking 8 vs 6.
- **Haptics**: gated on `settings.haptics` in kit/Dock/engines; **ungated** in Launch, Onboarding ×2,
  Profile, Market, Social, `useDiscovery`.
- **Press states**: three patterns (kit `useState(down)` squash, HUD render-prop, bare `Pressable`).
- **Backdrops**: 5 tones in use across 6 surfaces → every tab reads as a different app.

## 3. Expo / native capabilities in use

| Package | Used? | Where / how |
|---|---|---|
| `expo` 57, `expo-dev-client` | yes | dev build |
| `expo-asset` | plugin only | `app.json` |
| `expo-audio` | yes | `src/audio/sfx.ts` — hiss loop, rattle, click; `setAudioModeAsync` |
| `expo-blur` | **no** | installed, never imported |
| `expo-build-properties` | plugin | iOS deployment target 16.4 |
| `expo-camera` | yes | `PaintScreen` (non-ARKit camera), Onboarding permission |
| `expo-file-system` | yes | world-map download/upload, share-card PNG, wall photos |
| `expo-font` + `@expo-google-fonts/*` | yes | Pixelify Sans, VT323 (Silkscreen unused) |
| `expo-haptics` | yes | 11 files |
| `expo-keep-awake` | yes | Create tab |
| `expo-linear-gradient` | yes | Social share card only |
| `expo-location` | yes | `useLocation` watch (BestForNavigation), Onboarding permission |
| `expo-sensors` | yes | `usePose` DeviceMotion + Magnetometer (aim, shake) |
| `expo-sharing` | yes | Android share (RN `Share` on iOS) |
| `expo-status-bar` | yes | `App.tsx` |
| `@bacons/apple-targets` | yes | WidgetKit extension `targets/widget` (small/medium + lock-screen), App Group `ExtensionStorage` |
| `@shopify/react-native-skia` | yes | paint layer, backdrop, icons, cans, globe, share snapshot |
| `react-native-reanimated` 4 | yes | dock, HUD, overlays, viewer |
| `react-native-maps` | yes | Explore heat map (`Circle`s per canvas) |
| `react-native-volume-manager` | yes | volume rocker spray trigger |
| `react-native-safe-area-context` | yes | Android dock inset |
| `modules/ar-paint` (custom) | yes | ARKit (iOS) / ARCore (Android) surface painting, world maps, snapshot, undo |
| `zustand`, `@supabase/supabase-js`, AsyncStorage | yes | store, backend, cache |

Native targets: app (`com.hamzakhan.tagged`, App Group `group.com.hamzakhan.tagged`, `UIBackgroundModes:
audio`, `arkit` required) + `widget` extension (deployment 17.0; WidgetKit, SwiftUI, ActivityKit,
AppIntents linked by the plugin). No Live Activity, no notifications, no updates, no brightness.
