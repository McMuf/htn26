// Custom entry point. expo-router owns the app (its own entry calls registerRootComponent for
// app/_layout.tsx), but the Android widget's headless task needs its handler registered the moment
// the JS context boots -- including when Android starts that context for a widget update alone,
// with no activity and no route tree ever rendered. Route modules are not evaluated in that case,
// so the registration cannot live in app/_layout.tsx. It has to be the bundle's entry, which is
// why package.json's "main" points here rather than at expo-router/entry.
import 'expo-router/entry';

import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './widget-task-handler';

// Inert on iOS, where the widget is a SwiftUI target (targets/widget) fed through the App Group
// and react-native-android-widget resolves to a noop module.
registerWidgetTaskHandler(widgetTaskHandler);
