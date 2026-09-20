import { Slot } from 'expo-router';

/**
 * Root layout. The app has one route: everything (launch page, onboarding, tabs, sheets) is still
 * the hand-rolled navigation in ../App.tsx. expo-router only owns the entry point, deep links
 * (scheme "tagged") and, later, any routes worth adding as files here.
 */
export default function RootLayout() {
  return <Slot />;
}
