/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'widget',
  displayName: 'Tagged Can',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: '#0b0b0f',
    $accent: '#ff2d95',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
