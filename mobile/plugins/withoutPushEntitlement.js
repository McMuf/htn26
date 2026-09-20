const { withMod, IOSConfig } = require('expo/config-plugins');
const plist = require('@expo/plist');
const fs = require('fs');

/**
 * expo-notifications' plugin adds the `aps-environment` (remote push) entitlement whether or not you
 * use push. Cospray only sends local "hot spot nearby" banners, and the team provisioning profile has
 * no Push Notifications capability, so the build fails with it present. This runs after every other
 * iOS mod and removes the key from the generated entitlements file.
 */
module.exports = function withoutPushEntitlement(config) {
  return withMod(config, {
    platform: 'ios',
    mod: 'finalized',
    action: (config) => {
      try {
        const file = IOSConfig.Entitlements.getEntitlementsPath(config.modRequest.projectRoot);
        if (file && fs.existsSync(file)) {
          const ent = plist.default.parse(fs.readFileSync(file, 'utf8'));
          if ('aps-environment' in ent) {
            delete ent['aps-environment'];
            fs.writeFileSync(file, plist.default.build(ent));
          }
        }
      } catch (e) { console.warn('withoutPushEntitlement:', e.message); }
      return config;
    },
  });
};
