# Goal 1 — a web version anyone can join by scanning a QR code

**Done when:** someone points their camera at a QR code, types a name, and is drawing seconds
later — and a second person who scans the same code sees those strokes appear live, both ways. No
accounts, no profile, no tabs. One screen.

The Android app is [goal2.md](goal2.md) and doesn't block this.

---

## This is mostly a trim, not a build

`web/` is already a working client — it's what the judges' site runs on:

| Already there | Where |
|---|---|
| A painting screen (camera passthrough, compass-anchored strokes, hold-to-spray) | `web/src/screens/PaintScreen.tsx` |
| "Type your tag → start" | `web/src/screens/NameScreen.tsx` |
| Strokes syncing live between clients (realtime insert + a 15 s poll backup) | `web/src/data/sync.ts` |
| The Supabase project behind it, set up and verified | done — see *The backend* below |

So the work is mostly **removing** things and **changing how people get in**. Four changes.

## The four changes

### 1. Delete the login

`/paint` currently shows an email + password form (`AuthScreen`) before anything else. That's the
biggest thing standing between a QR scan and drawing. Replace it with
`supabase.auth.signInAnonymously()` fired on load — anonymous sign-in is already enabled on the
project — so the first thing a scanner sees is the name prompt. Keep the email form reachable only
as a fallback if anonymous sign-in is ever turned off.

### 2. Strip the shell to one screen

`App.tsx` renders a three-tab shell: PAINT / MAP / BOARD, plus a settings sheet. All of it goes
except the paint screen and the minimum HUD it needs. `MapScreen`, `LeaderboardScreen`,
`SettingsScreen` and the tab bar stop being rendered (the files can stay for the judges' site).

### 3. Make the QR *be* the room

This is the real design decision, and it's why scanning works at all.

Today a client joins a canvas by **standing within 15 m of it** (`CANVAS_JOIN_RADIUS_M`, GPS).
That's fine for two phones on the same street and bad for everything else: browser geolocation
indoors drifts, and a laptop resolves by IP — often kilometres off. Two people scanning the same
code in the same room would each start their own wall and see nothing of each other.

Fix: put the wall's id in the link the QR encodes — `/paint?w=<canvas id>` — and have the client
join *that* canvas instead of guessing from GPS. Everyone who scans the same code paints the same
wall, in the same room or on different continents. No parameter in the URL → fall back to today's
GPS behaviour, so the existing phone flow is untouched.

Also worth removing for this version: the **25 km Waterloo geofence** blocks painting outside
Waterloo, and its bypass lives in the settings screen we're deleting. A QR room should skip it.

### 4. Deploy it and generate the QR

iOS Safari only grants camera and motion over **HTTPS**, so this has to be the deployed URL, not
`localhost`. Deploy `web/` to Vercel, then generate a QR for
`https://<your-site>/paint?w=<canvas id>` and put the image somewhere you can show on a screen or
print.

## Two decisions I need from you

**A. Does the QR mean "this wall" or just "this app"?**

- **A shared room (recommended):** the QR carries a wall id; everyone who scans it draws on the
  same wall wherever they are. This is what "scan and draw together" normally means, it demos on a
  laptop, and it survives bad indoor GPS.
- **Keep GPS:** the QR is only a link to the app, and people still have to be within 15 m of each
  other. Truer to the original "paint is tied to a place" idea, much more fragile in a room.

**B. What does the drawing surface look like?**

The paint screen composites strokes over the live camera. For a web version that might be handed
to anyone, the options are: keep the camera (feels like the real app, needs permission and a rear
camera), or draw on a flat background (works on a laptop, loses the AR feel). Keeping the camera
with a graceful fallback to flat is possible but is extra work.

Say the word on A and B and I'll implement the rest — it's all code on my side.

## Then: the test that says it's done

1. Open the deployed `/paint?w=…` link on phone 1. Type a name. You should be drawing without
   ever seeing a login.
2. Scan the same QR on phone 2 (or just open the link in another browser). Type a different name.
3. Draw on phone 1 → it appears on phone 2 within a second or two, without either of you
   reloading. Draw on phone 2 → it comes back the other way.
4. Reload both. The wall still has everything on it (strokes are stored, not just broadcast).
5. Hand the QR to someone who's never seen the app: from scan to first stroke with nobody
   explaining anything is the actual bar.

## The backend (already done)

Goal 1 used to be about this part, and it's finished. Your own Supabase project
(`xevbnegilqjyjzxhrcwo`) has the schema, the AR migration, the seed pieces and anonymous sign-in
turned on, and every client — phone app, website, painter — points at it:

```
ok  schema.sql ran (strokes table reachable)
ok  migration_ar.sql ran (anchor_id, transform, viewer)
ok  canvases carry a world map pointer
ok  nearby_canvases RPC exists
ok  worldmaps storage bucket exists
ok  anonymous sign-in enabled
```

`npm run supabase:check` re-runs that (`--anon` includes the sign-in test, which creates one
throwaway user).

**If you also run the phone app against this project:** restart Metro with
`npx expo start --dev-client -c` (`-c` matters — `EXPO_PUBLIC_*` is inlined at bundle time), and on
an iPhone that already had the app, sign out and redo onboarding, because the saved painter belongs
to the old project's auth user. Queued strokes drain by themselves; the backlog is capped at 120.

**Pointing at a different project later:** create it, paste `supabase/setup_all.sql` into the SQL
editor (it warns about destructive statements — on a fresh project there's nothing to lose), turn
on **Allow anonymous sign-ins** under Authentication → Sign In / Providers *and press Save changes
at the bottom*, copy the **publishable** key (never `service_role` — it bypasses RLS), then:

```powershell
node scripts/use_supabase.mjs https://<ref>.supabase.co <publishable key>
```

That writes `.env`, `web/.env`, `web/.env.production` and `eas.json`, and re-runs the checks.

## What will bite

- **Tags are unique.** `painters.name` has a `unique` constraint, so the second person to type
  "ADARSH" gets *That tag is taken — pick another*. In a room full of people scanning a code that's
  friction; the fix is to auto-suffix (`ADARSH-2`) rather than to reject them.
- **Every scan creates an auth user.** Anonymous sign-ins are cheap but they are rows, and Supabase
  counts monthly active users. Fine for a demo, worth knowing before it's on a poster.
- **iOS Safari needs a gesture** before camera, motion and audio — the paint screen's START button
  already covers that, so it has to stay.
- **Sync is per wall, not per person.** Everyone on the wall sees everything; there's no undo for
  someone else's paint and no moderation beyond the existing report flow.
- **Realtime on the free tier** is fine for a handful of painters. A crowd is untested.
