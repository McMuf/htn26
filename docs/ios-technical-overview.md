# iOS technical overview — the walkthrough

The demo narration for Cospray on iOS: what each screen does, and the Expo surface behind it.

Let's take a look at Cospray in depth.

## Launch

Opening the app drops you onto a pixel Earth that spins under an orbiting spray can. That Earth
isn't a static image. It's drawn entirely at runtime using React Native Skia from a real land mask,
staying perfectly crisp at any scale. The dive itself is Reanimated 4 running flawlessly on the UI
thread, with our typography loaded through expo-font.

## Sign in

To keep the demo completely frictionless, your identity is instantly handled by a Supabase anonymous
session — no password walls between the user and the canvas. The permission prompts are driven by
expo-camera, expo-location, and expo-sensors, with their usage strings declared directly in our
config plugins so the native Info.plist is generated automatically rather than hand-edited.

## Home

Once authenticated, you land on the Home page. This is your dashboard, showing your two cans live:
paint levels, pressure, and a refill countdown. Below that are your daily quests. Claim them to earn
in-game currency, which directly impacts your global ranking, complete with a tactile kick from
expo-haptics.

Under the hood, your spray can is a Zustand store persisted through AsyncStorage, so your paint and
pressure dynamics survive app restarts. But we didn't keep that data trapped in the app — that same
store is mirrored into an App Group. This powers a WidgetKit home-screen widget and a Dynamic Island
Live Activity via expo-live-activity, meaning your live paint level stays right on your lock screen
while you spray.

## Vault

Next, we have the Vault. This is where your history lives. You can look back at every wall you've
ever painted, featuring a real photo of the piece on the actual surface, pinned to its exact
coordinates.

The magic here is the photo capture. It comes from our own custom Expo native module. We added a
`snapshot()` function to the ARKit view that cleanly composites the camera frame with the paint
texture — hiding the targeting reticle and grids — and writes a high-res JPEG through
expo-file-system's new File/Paths API. And if a piece is missing its photo, Skia acts as a fallback,
re-rendering your strokes as a pixel mosaic on a virtual brick wall.

## Explore

Moving over to Explore, you'll find the spatial Heat Map. This lets you view all the active drawings
and hidden canvases in your immediate vicinity. Right beneath that is the Trending Pieces carousel,
ranked by community upvotes. The more upvotes your street art gets, the more in-game currency you
earn. The spatial tracking here leverages the same expo-location and sensor suites to keep the map
aggressively synced to your physical surroundings.

## Social

Finally, we have the Social tab. At the top, you get a breakdown of your summary stats, beautifully
rendered into a dynamic, "Spotify Wrapped"-style card of your drawing history that you can push
straight to your other social feeds using expo-sharing. Below that, a live leaderboard ranks your
friends by their photo performance and total upvotes.

## Widgets

If we come out of the app, we have widgets organized into three categories: dynamic island, big
widget, and <!-- TODO: finish this list -->

## The through line

All of that is one Expo codebase — and where Expo didn't have what we needed, we wrote the native
module ourselves with the Expo Modules API: ARKit in Swift, ARCore in Kotlin, one TypeScript
interface.
