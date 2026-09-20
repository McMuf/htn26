// Every stub the shell shows lives here so it's obvious what's real vs. dressed-up.
// Real data (Supabase) always wins; these only fill empty lists so the demo never looks dead.
import type { Canvas } from '../types';

/** Alive-looking canvases around campus, used only when the backend returns nothing. */
export const MOCK_CANVASES: Canvas[] = [
  { id: 'mock-e7', lat: 43.4729, lng: -80.5397, heading: 200, title: 'E7 underpass', author_id: null, author_name: 'NEON_KID', views: 128, stroke_count: 41, flags: 0, flagged: false, created_at: iso(-3), updated_at: iso(-1) },
  { id: 'mock-slc', lat: 43.4716, lng: -80.5451, heading: 90, title: 'SLC wall', author_id: null, author_name: 'sprayzilla', views: 96, stroke_count: 29, flags: 0, flagged: false, created_at: iso(-8), updated_at: iso(-2) },
  { id: 'mock-dc', lat: 43.4727, lng: -80.5421, heading: 320, title: 'DC library', author_id: null, author_name: 'mira.wav', views: 61, stroke_count: 18, flags: 0, flagged: false, created_at: iso(-20), updated_at: iso(-5) },
  { id: 'mock-lazaridis', lat: 43.4693, lng: -80.5322, heading: 150, title: 'Lazaridis Hall', author_id: null, author_name: 'DripLord', views: 44, stroke_count: 12, flags: 0, flagged: false, created_at: iso(-30), updated_at: iso(-9) },
  { id: 'mock-uptown', lat: 43.4654, lng: -80.5225, heading: 10, title: 'Uptown square', author_id: null, author_name: 'ok_tagger', views: 210, stroke_count: 77, flags: 0, flagged: false, created_at: iso(-50), updated_at: iso(-12) },
];

export const isMock = (id: string) => id.startsWith('mock-');
function iso(hoursAgo: number) { return new Date(Date.now() + hoursAgo * 3600e3).toISOString(); }
