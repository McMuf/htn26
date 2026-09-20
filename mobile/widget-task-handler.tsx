import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { CosprayWidget } from './widgets/CosprayWidget';
import { EMPTY_SNAPSHOT, loadWidgetSnapshot } from './src/lib/widgetSnapshot';

/**
 * Android calls this in a headless JS context whenever it wants the widget redrawn — on add, on
 * resize, and on its own schedule (30 minutes at the fastest, which is Android's floor, not ours).
 * Live values while the app is open come from requestWidgetUpdate in src/lib/widgetAndroid.tsx.
 *
 * There is no zustand store here: this runs outside the app's React tree, so the snapshot is read
 * back from AsyncStorage, which the app keeps current.
 *
 * This must never throw. An exception here leaves the widget blank with nothing the user can see,
 * so every path ends in a render.
 */
const WIDGET_NAME = 'Cospray';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== WIDGET_NAME) return;

  const widthDp = props.widgetInfo.width ?? 160;
  const heightDp = props.widgetInfo.height ?? 160;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      let snap = EMPTY_SNAPSHOT;
      try {
        snap = (await loadWidgetSnapshot()) ?? EMPTY_SNAPSHOT;
      } catch {
        // Never leave the widget blank: fall back to full cans and nothing nearby.
      }
      props.renderWidget(<CosprayWidget snap={snap} widthDp={widthDp} heightDp={heightDp} />);
      break;
    }

    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
    default:
      break;
  }
}
