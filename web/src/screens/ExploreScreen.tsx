import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import { fetchAllCanvases } from '../data/sync';
import { GEOFENCE } from '../config';
import { SAMPLE_CANVASES, isSample, trendingScore } from '../site/data';
import { haversineM } from '../lib/geo';
import { Header, Panel, timeAgo } from '../ui/kit';
import { PieceThumb } from '../ui/PieceThumb';
import type { Canvas } from '../types';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** Recency-weighted activity (the phone's heat model, mobile/src/lib/heat.ts). */
function heatWeights(canvases: Canvas[]) {
  const raw = canvases.map((c) => [c.id, (c.stroke_count + 0.5 * c.views) * Math.max(0.15, Math.exp(-Math.max(0, (Date.now() - Date.parse(c.updated_at)) / 3600e3) / 36))] as const);
  const max = Math.max(1e-6, ...raw.map(([, w]) => w));
  return Object.fromEntries(raw.map(([id, w]) => [id, Math.max(0.12, w / max)]));
}
const pinHtml = '<div class="pxpin"><i class="head"><b></b></i><i class="tail"></i></div>';

/** Hot zones: a dark-purple map zoomed to a few blocks with neon heat + pixel pins; then trending and nearby. */
export function ExploreScreen() {
  const local = useStore((s) => s.canvases);
  const loc = useStore((s) => s.location);
  const discovered = useStore((s) => s.discovered);
  const [remote, setRemote] = useState<Canvas[]>([]);
  const load = useCallback(() => { fetchAllCanvases().then(setRemote).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const all = useMemo(() => {
    const m = new Map<string, Canvas>();
    for (const c of remote) m.set(c.id, c);
    for (const c of Object.values(local)) m.set(c.id, { ...m.get(c.id), ...c });
    const real = [...m.values()].filter((c) => !c.flagged);
    return real.length ? real : SAMPLE_CANVASES;
  }, [remote, local]);
  const trending = useMemo(() => [...all].sort((a, b) => trendingScore(b) - trendingScore(a)).slice(0, 10), [all]);
  const nearby = useMemo(() => (loc ? all.map((c) => ({ c, d: haversineM(loc.lat, loc.lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d).slice(0, 8) : []), [all, loc]);

  // the map
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const el = elRef.current; if (!el || mapRef.current) return;
    const center: L.LatLngTuple = loc ? [loc.lat, loc.lng] : all[0] ? [all[0].lat, all[0].lng] : [GEOFENCE.lat, GEOFENCE.lng];
    const map = L.map(el, { center, zoom: 17, minZoom: 12, maxZoom: 19, zoomControl: false, attributionControl: false });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTR, className: 'purple-tiles' }).addTo(map);
    layer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; layer.current = null; };
  }, []);
  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    const w = heatWeights(all);
    for (const c of all) {
      const h = w[c.id] ?? 0.12;
      const r = 30 + h * 90;
      L.circle([c.lat, c.lng], { radius: r, stroke: false, fillColor: '#7a45ff', fillOpacity: 0.18, interactive: false }).addTo(g);
      L.circle([c.lat, c.lng], { radius: r * 0.55, stroke: false, fillColor: '#59d92d', fillOpacity: 0.28, interactive: false }).addTo(g);
      L.circle([c.lat, c.lng], { radius: r * 0.25, color: '#0a0620', weight: 2, fillColor: '#9cff6b', fillOpacity: 0.75, interactive: false }).addTo(g);
      L.marker([c.lat, c.lng], { icon: L.divIcon({ html: pinHtml, className: 'pxpin-wrap', iconSize: [16, 24], iconAnchor: [8, 24] }) })
        .bindPopup(`<b>${c.title ?? `${c.author_name}'s piece`}</b><br>${c.views} views · ${c.stroke_count} strokes${discovered[c.id] ? ' · found' : ''}`).addTo(g);
    }
    if (loc) L.circleMarker([loc.lat, loc.lng], { radius: 6, color: '#0a0620', weight: 2, fillColor: '#59d92d', fillOpacity: 1, interactive: false }).addTo(g);
  }, [all, loc, discovered]);
  useEffect(() => { if (mapRef.current && loc) mapRef.current.panTo([loc.lat, loc.lng]); }, [loc?.lat, loc?.lng]);

  return (
    <div className="screen">
      <div className="backdrop" />
      <Header title="EXPLORE" sub={all === SAMPLE_CANVASES ? 'no pieces yet · showing sample spots' : `${all.length} walls across Waterloo`} />
      <Panel title="HOT ZONES">
        <div ref={elRef} className="mapframe" />
      </Panel>
      <div className="t-label">TRENDING PIECES</div>
      <div className="hscroll">
        {trending.map((c, i) => (
          <div key={c.id} className="pxbox tile card" style={{ width: 188, flex: '0 0 auto' }}>
            <div style={{ position: 'relative' }}>
              <PieceThumb canvasId={c.id} width={172} height={124} />
              <div className={`rank r${Math.min(i + 1, 4)}`}>{i + 1}</div>
            </div>
            <div className="t-card ellipsis">{c.title ?? `${c.author_name}'s piece`}</div>
            <div className="t-small">{c.views} views · {c.stroke_count} strokes</div>
          </div>
        ))}
      </div>
      <div className="t-label">NEARBY CANVASES</div>
      {!loc && <div className="t-sub">waiting for GPS…</div>}
      {nearby.map(({ c, d }) => (
        <div key={c.id} className="pxbox tile row">
          <PieceThumb canvasId={c.id} width={64} height={64} />
          <div className="row-main">
            <div className="t-card">{c.title ?? `${c.author_name}'s piece`}</div>
            <div className="t-small">{c.author_name} · {timeAgo(c.updated_at)} · {c.stroke_count} strokes</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-card" style={{ fontSize: 16 }}>{d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}</div>
            <div className="t-micro" style={{ color: discovered[c.id] ? 'var(--green-hi)' : isSample(c.id) ? 'var(--faint)' : 'var(--white)' }}>{discovered[c.id] ? 'FOUND' : isSample(c.id) ? 'SAMPLE' : 'UNDISCOVERED'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
