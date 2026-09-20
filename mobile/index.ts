import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './widget-task-handler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// The Android home-screen widget's headless renderer. Inert on iOS, where the widget is a
// SwiftUI target (targets/widget) fed through the App Group instead.
registerWidgetTaskHandler(widgetTaskHandler);
