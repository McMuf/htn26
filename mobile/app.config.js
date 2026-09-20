// Lets anyone build with their own Apple team WITHOUT editing app.json.
// With none of these set, this file returns app.json untouched (Hamza's team, bundle id and widget).
// To override, put these in .env.local (git-ignored):
//   FRESCO_BUNDLE_ID=com.yourname.fresco   your own unique bundle id
//   FRESCO_TEAM_ID=ABCDE12345              optional; otherwise pick the team in Xcode
//   FRESCO_NO_WIDGET=1                     free "Personal Team" accounts cannot use App Groups,
//                                          so the widget target and App Group entitlement are dropped
module.exports = ({ config }) => {
  config = withGoogleMaps(config);

  const bundleId = process.env.FRESCO_BUNDLE_ID;
  if (!bundleId) return config;

  const ios = { ...config.ios, bundleIdentifier: bundleId };
  if (process.env.FRESCO_TEAM_ID) ios.appleTeamId = process.env.FRESCO_TEAM_ID;
  else delete ios.appleTeamId; // never inherit someone else's team

  let plugins = config.plugins;
  if (process.env.FRESCO_NO_WIDGET === '1') {
    const { 'com.apple.security.application-groups': _groups, ...entitlements } = ios.entitlements ?? {};
    ios.entitlements = entitlements;
    plugins = (plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) !== '@bacons/apple-targets');
  }
  return { ...config, ios, plugins };
};

/**
 * Explore's heat map uses Google Maps on Android, which throws while inflating the view if
 * com.google.android.geo.API_KEY isn't in the manifest — a hard crash, not a blank map. So the key
 * is optional here and the app falls back to its own pixel heat view without one (see
 * src/components/HeatMap.tsx). iOS uses Apple Maps and needs no key at all.
 *
 * One variable does both halves: the manifest (at prebuild) and the JS check (EXPO_PUBLIC_* is
 * inlined into the bundle). Put it in mobile/.env.local:
 *   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
 * Restrict it to Android apps, package com.hamzakhan.tagged, with the keystore SHA-1 in
 * run-android.md — same console, and the same restriction, as the ARCore key.
 */
function withGoogleMaps(config) {
  const key = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '').trim();
  if (!key) return config;
  const android = { ...config.android, config: { ...config.android?.config, googleMaps: { apiKey: key } } };
  return { ...config, android };
}
