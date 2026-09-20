/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'widget',
  displayName: 'Cospray Radar',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: '#12082b',
    $accent: '#59d92d',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
