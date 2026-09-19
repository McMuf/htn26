import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasBackend, supabase } from '../lib/supabase';
import { NEARBY_FETCH_RADIUS_M } from '../config';
import { useStore } from '../store';
import { getWall } from '../paint/Wall';
import { File, Paths } from 'expo-file-system';
import type { Canvas, Painter, Stroke } from '../types';

/**
 * Local-first sync. Every canvas/stroke is applied to the store + wall raster immediately and
 * cached in AsyncStorage; Supabase is the shared source of truth when reachable. Strokes that
 * fail to upload are queued and retried, so a flaky hackathon network never blocks painting.
 */

const CACHE_CANVASES = 'tagged:cache:canvases';
const CACHE_STROKES = 'tagged:cache:strokes:';
const PENDING = 'tagged:pending';

export function applyStroke(s: Stroke) {
  const st = useStore.getState();
  if (!st.addStroke(s)) return false;
  if (!s.anchor_id) { getWall(s.canvas_id).replay(s); st.bumpWalls(); }
  remoteStrokeListeners.forEach((fn) => fn(s));
  return true;
}
const remoteStrokeListeners = new Set<(s: Stroke) => void>();
/** AR screen subscribes to be told about strokes arriving for the canvas it has loaded. */
export function onRemoteStroke(fn: (s: Stroke) => void) { remoteStrokeListeners.add(fn); return () => { remoteStrokeListeners.delete(fn); }; }

/** Painter row for the signed-in user (id = auth uid). Throws with a readable message on failure. */
export async function ensurePainter(userId: string, name: string): Promise<Painter> {
  const { data, error } = await supabase.from('painters').upsert({ id: userId, name }, { onConflict: 'id' }).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('That tag is taken — pick another.');
    throw new Error(error.message);
  }
  useStore.getState().setOnline(true);
  return { id: data.id, name: data.name, paint_used: data.paint_used, strokes: data.strokes };
}

/** Existing painter row for a signed-in user, or null if they haven't picked a tag yet. */
export async function fetchPainter(userId: string): Promise<Painter | null> {
  const { data, error } = await supabase.from('painters').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: data.id, name: data.name, paint_used: data.paint_used, strokes: data.strokes } : null;
}

export async function loadCached() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_CANVASES);
    if (!raw) return;
    const canvases: Canvas[] = JSON.parse(raw);
    useStore.getState().setCanvases(canvases);
    for (const c of canvases) {
      const sraw = await AsyncStorage.getItem(CACHE_STROKES + c.id);
      if (sraw) for (const s of JSON.parse(sraw) as Stroke[]) applyStroke(s);
    }
  } catch {}
}

async function cacheCanvas(c: Canvas) {
  try {
    const all = Object.values(useStore.getState().canvases);
    await AsyncStorage.setItem(CACHE_CANVASES, JSON.stringify(all));
    const ss = useStore.getState().strokes[c.id] ?? [];
    await AsyncStorage.setItem(CACHE_STROKES + c.id, JSON.stringify(ss));
  } catch {}
}

export async function loadNearby(lat: number, lng: number) {
  if (!hasBackend) return;
  try {
    const { data: canvases, error } = await supabase.rpc('nearby_canvases', { qlat: lat, qlng: lng, radius_m: NEARBY_FETCH_RADIUS_M });
    if (error) throw error;
    const st = useStore.getState();
    st.setOnline(true);
    st.setCanvases(canvases as Canvas[]);
    const ids = (canvases as Canvas[]).map((c) => c.id);
    if (ids.length) {
      const { data: strokes, error: e2 } = await supabase.from('strokes').select('*').in('canvas_id', ids).order('created_at');
      if (e2) throw e2;
      for (const s of strokes as Stroke[]) applyStroke(s);
    }
    for (const c of canvases as Canvas[]) cacheCanvas(c);
  } catch (e) {
    console.warn('loadNearby failed', e);
    useStore.getState().setOnline(false);
  }
}

export async function createCanvas(c: Canvas) {
  const st = useStore.getState();
  st.upsertCanvas(c);
  cacheCanvas(c);
  if (!hasBackend) return;
  try {
    const { error } = await supabase.from('canvases').insert({
      id: c.id, lat: c.lat, lng: c.lng, heading: c.heading, title: c.title,
      author_id: isLocalId(c.author_id) ? null : c.author_id, author_name: c.author_name,
    });
    if (error) throw error;
  } catch (e) { console.warn('createCanvas failed', e); }
}

export async function uploadStroke(s: Stroke) {
  const c = useStore.getState().canvases[s.canvas_id];
  if (c) cacheCanvas(c);
  if (!hasBackend) return;
  const row = {
    id: s.id, canvas_id: s.canvas_id, author_id: isLocalId(s.author_id) ? null : s.author_id,
    author_name: s.author_name, color: s.color, cap: s.cap, points: s.points, paint_used: s.paint_used,
    anchor_id: s.anchor_id ?? null, transform: s.transform ?? null, viewer: s.viewer ?? null,
  };
  try {
    // make sure our own canvas row exists first (its insert may have failed earlier)
    if (c && c.author_id && c.author_id === useStore.getState().painter?.id) {
      await supabase.from('canvases').upsert({ id: c.id, lat: c.lat, lng: c.lng, heading: c.heading, title: c.title, author_id: c.author_id, author_name: c.author_name }, { onConflict: 'id', ignoreDuplicates: true });
    }
    const { error } = await supabase.from('strokes').insert(row);
    if (error) throw error;
    useStore.getState().setOnline(true);
  } catch (e) {
    console.warn('uploadStroke failed, queued', e);
    useStore.getState().setOnline(false);
    try {
      const q = JSON.parse((await AsyncStorage.getItem(PENDING)) ?? '[]');
      q.push(row);
      await AsyncStorage.setItem(PENDING, JSON.stringify(q));
    } catch {}
  }
}

export async function flushPending() {
  if (!hasBackend) return;
  try {
    const q: any[] = JSON.parse((await AsyncStorage.getItem(PENDING)) ?? '[]');
    if (!q.length) return;
    const { error } = await supabase.from('strokes').upsert(q, { onConflict: 'id' });
    if (!error) { await AsyncStorage.removeItem(PENDING); return; }
    // batch failed: retry row by row and drop rows that can never succeed (FK / RLS / duplicate)
    const keep: any[] = [];
    for (const row of q) {
      const { error: e } = await supabase.from('strokes').upsert(row, { onConflict: 'id' });
      if (e && !['23503', '42501', '23505'].includes(e.code ?? '')) keep.push(row);
    }
    await AsyncStorage.setItem(PENDING, JSON.stringify(keep));
  } catch {}
}

export function subscribeRealtime() {
  if (!hasBackend) return () => {};
  const ch = supabase
    .channel('tagged')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'strokes' }, (payload) => {
      const s = payload.new as Stroke;
      if (!useStore.getState().canvases[s.canvas_id]) return; // not nearby / unknown canvas
      applyStroke(s);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'canvases' }, (payload) => {
      useStore.getState().upsertCanvas(payload.new as Canvas);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'canvases' }, (payload) => {
      const c = payload.new as Canvas;
      if (useStore.getState().canvases[c.id]) useStore.getState().upsertCanvas(c);
    })
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export async function incrementViews(canvasId: string) {
  const st = useStore.getState();
  const c = st.canvases[canvasId];
  if (c) st.upsertCanvas({ ...c, views: c.views + 1 });
  if (!hasBackend) return;
  try { await supabase.rpc('increment_views', { cid: canvasId }); } catch {}
}

export async function reportCanvas(canvasId: string, reporterId: string | null, reason: string) {
  if (!hasBackend) return;
  try {
    await supabase.from('reports').insert({ canvas_id: canvasId, reporter_id: isLocalId(reporterId) ? null : reporterId, reason });
  } catch (e) { console.warn('report failed', e); }
}

export async function fetchLeaderboard(): Promise<Painter[]> {
  if (!hasBackend) return [];
  const { data, error } = await supabase.from('painters').select('*').order('paint_used', { ascending: false }).limit(25);
  if (error) throw error;
  return data as Painter[];
}

export async function fetchAllCanvases(): Promise<Canvas[]> {
  if (!hasBackend) return Object.values(useStore.getState().canvases);
  const { data, error } = await supabase.from('canvases').select('*').eq('flagged', false).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data as Canvas[];
}

function isLocalId(id: string | null) { return !id || id.startsWith('local-'); }

// ---- AR world maps (Supabase Storage bucket "worldmaps") ---------------------------------

export async function uploadWorldMap(canvasId: string, localPath: string) {
  if (!hasBackend) return null;
  try {
    const buf = await new File(localPath).arrayBuffer();
    const objectPath = `${canvasId}.arworldmap`;
    const { error } = await supabase.storage.from('worldmaps').upload(objectPath, buf, { upsert: true, contentType: 'application/octet-stream' });
    if (error) throw error;
    const now = new Date().toISOString();
    const { error: e2 } = await supabase.rpc('set_world_map', { cid: canvasId, path: objectPath });
    if (e2) throw e2;
    const c = useStore.getState().canvases[canvasId];
    if (c) useStore.getState().upsertCanvas({ ...c, world_map_path: objectPath, world_map_updated_at: now });
    return objectPath;
  } catch (e) {
    console.warn('uploadWorldMap failed', e);
    return null;
  }
}

/** Downloads the canvas's world map to the cache and returns its local path (null if none). */
export async function downloadWorldMap(c: Canvas): Promise<string | null> {
  if (!hasBackend || !c.world_map_path) return null;
  try {
    const { data } = supabase.storage.from('worldmaps').getPublicUrl(c.world_map_path);
    const stamp = (c.world_map_updated_at ?? '').replace(/[^0-9]/g, '');
    const dest = new File(Paths.cache, `${c.id}-${stamp}.arworldmap`);
    if (dest.exists) return dest.uri.replace('file://', '');
    const f = await File.downloadFileAsync(data.publicUrl + `?v=${stamp}`, dest);
    return f.uri.replace('file://', '');
  } catch (e) {
    console.warn('downloadWorldMap failed', e);
    return null;
  }
}
