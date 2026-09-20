#!/bin/sh
# The Live Activity attributes are compiled into both the app (via the LiveActivity pod) and the widget
# extension. ActivityKit matches them by type name + Codable shape, so the two files must not drift.
cd "$(dirname "$0")/../mobile" || exit 1
if cmp -s targets/widget/CosprayPaintAttributes.swift modules/live-activity/ios/CosprayPaintAttributes.swift; then
  echo "live activity attributes: in sync"
else
  echo "live activity attributes DRIFTED: targets/widget/CosprayPaintAttributes.swift != modules/live-activity/ios/CosprayPaintAttributes.swift" >&2
  exit 1
fi
