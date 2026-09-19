const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * Android: puts the ARCore Cloud Anchors API key (ARCORE_API_KEY, read from the environment /
 * .env.local at prebuild time) into the manifest. Without a key the app still paints in AR; saved
 * pieces then reappear "placed from memory" instead of resolving onto the exact wall spot.
 */
module.exports = function withArPaint(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const key = (process.env.ARCORE_API_KEY || '').trim();
    if (key) AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.android.ar.API_KEY', key);
    else AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, 'com.google.android.ar.API_KEY');
    return cfg;
  });
};
