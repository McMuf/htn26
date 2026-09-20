#!/usr/bin/env node
/**
 * Turn the dev client's shake-to-open-the-dev-menu gesture off (or back on).
 *
 * Fresco uses a physical shake to charge the spray can, and in a development build expo-dev-menu
 * listens for the same gesture and wins: you shake the can and get the debug menu. There is no way
 * to preempt this from app code — expo-dev-menu reads `motionGestureEnabled` from its own
 * SharedPreferences with a hard-coded `true` default (no AndroidManifest meta-data key, unlike
 * `EXDevMenuShowFloatingActionButton` and friends) and exposes nothing to JavaScript. So we write
 * the preference into the app's data directory over adb, which `run-as` permits because a debug
 * build is debuggable.
 *
 * The preference survives `expo run:android` and `adb install -r`, but a full uninstall wipes the
 * app's data with it, so re-run this after one. None of it applies to a release build: dev menu
 * isn't in that binary, and the shake is yours alone.
 *
 *   node scripts/dev_menu_shake.mjs        # off  (shake charges the can)
 *   node scripts/dev_menu_shake.mjs on     # back to stock dev-client behaviour
 *   node scripts/dev_menu_shake.mjs off --device RFCY70RR4WB
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PREFS = 'shared_prefs/expo.modules.devmenu.sharedpreferences.xml';
const KEY = 'motionGestureEnabled';

const argv = process.argv.slice(2);
const wanted = argv.find((a) => a === 'on' || a === 'off') ?? 'off';
const deviceIdx = argv.indexOf('--device');
const device = deviceIdx >= 0 ? argv[deviceIdx + 1] : null;

const die = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

/** adb from ANDROID_HOME first, since a Windows PATH often doesn't carry platform-tools. */
function findAdb() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null);
  if (home) {
    for (const exe of ['adb.exe', 'adb']) {
      const p = join(home, 'platform-tools', exe);
      if (existsSync(p)) return p;
    }
  }
  return 'adb'; // fall back to PATH and let it fail loudly
}

const adb = findAdb();
const run = (args, opts = {}) =>
  execFileSync(adb, device ? ['-s', device, ...args] : args, { encoding: 'utf8', ...opts }).trim();

const pkg = JSON.parse(readFileSync(join(HERE, '..', 'mobile', 'app.json'), 'utf8')).expo?.android?.package;
if (!pkg) die('no expo.android.package in mobile/app.json');

let devices;
try {
  devices = run(['devices']).split('\n').slice(1).filter((l) => l.trim().endsWith('device'));
} catch (e) {
  die(`could not run adb (${adb}): ${e.message}`);
}
if (!devices.length) die('no device — plug the phone in, accept the USB debugging prompt, check `adb devices`');

// Read what's there. A fresh install has no file at all, which is not an error.
let xml = '';
try {
  xml = run(['shell', `run-as ${pkg} cat ${PREFS} 2>/dev/null`]);
} catch { /* no prefs yet */ }
if (xml.includes('run-as: ') || xml.includes('not debuggable')) {
  die(`run-as was refused for ${pkg}. That happens on a release build — this only applies to a dev client.`);
}
if (!xml.includes('<map')) xml = `<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map>\n</map>`;

// Merge rather than replace: showsAtLaunch and isOnboardingFinished live in the same file, and
// clobbering them means the dev menu greets you on every launch.
const line = `    <boolean name="${KEY}" value="${wanted === 'on'}" />`;
const without = xml.split('\n').filter((l) => !l.includes(`name="${KEY}"`));
const close = without.findIndex((l) => l.includes('</map>'));
if (close < 0) die('could not parse the preferences file');
without.splice(close, 0, line);
const next = without.join('\n');

// The app caches SharedPreferences in memory and flushes on exit, so it has to be stopped first.
run(['shell', 'am', 'force-stop', pkg]);
// base64 rather than a pushed file: it survives Git Bash rewriting /data/... into a Windows path.
const b64 = Buffer.from(next, 'utf8').toString('base64');
run(['shell', `echo ${b64} | base64 -d | run-as ${pkg} sh -c 'cat > ${PREFS}'`]);

const back = run(['shell', `run-as ${pkg} cat ${PREFS}`]);
if (!back.includes(`name="${KEY}" value="${wanted === 'on'}"`)) die(`wrote the preference but read back:\n${back}`);

console.log(`✔ dev-menu shake gesture ${wanted === 'on' ? 'ENABLED (stock)' : 'DISABLED'} for ${pkg}`);
console.log(wanted === 'on'
  ? '  Shake opens the dev menu again.'
  : '  Shake now charges the can. Open the dev menu from the notification, or `adb shell input keyevent 82`.');
console.log('  Re-run after a full uninstall; an -r reinstall keeps it.');
