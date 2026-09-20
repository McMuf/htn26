import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { useStore } from '../store';

export function useLocation() {
  const setLocation = useStore((s) => s.setLocation);
  const [status, setStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setStatus('denied'); return; }
      setStatus('granted');
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) setLocation({ lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy ?? 50 });
      } catch {}
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0.5, timeInterval: 700 },
        (p) => setLocation({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? 50 }),
      );
    })();
    return () => { sub?.remove(); };
  }, []);
  return status;
}
