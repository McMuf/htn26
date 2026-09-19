// Generates supabase/seed.sql: three seeded pieces around E7 so judges can discover art
// without a second phone. Strokes are polylines in canvas degrees (yaw, pitch) rasterised
// into spray points identical to what the app records. Run: node scripts/gen_seed.mjs
import { writeFileSync } from 'node:fs';

const pieces = [
  { name: 'HTN', author: 'seed_nova', lat: 43.47295, lng: -80.53985, heading: 200, color: '#ff2d95', cap: 'fat',
    lines: letters('HTN', -14, 4, 9) },
  { name: 'smiley', author: 'seed_kit', lat: 43.47265, lng: -80.54030, heading: 120, color: '#ffe600', cap: 'fat',
    lines: [circle(0, 2, 10, 40), circle(-3.5, 5, 1.2, 12), circle(3.5, 5, 1.2, 12), arc(0, 1, 6, 200, 340, 16)] },
  { name: 'arrow', author: 'seed_lux', lat: 43.47320, lng: -80.53940, heading: 300, color: '#19e6ff', cap: 'skinny',
    lines: [[[-12, -2], [10, -2]], [[4, 4], [10, -2], [4, -8]], [[-12, 6], [-12, -10]]] },
];

function circle(cx, cy, r, n) { return Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]); }
function arc(cx, cy, r, a0, a1, n) { return Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }); }
function letters(text, x0, y0, h) {
  const w = h * 0.7, gap = h * 0.35; const out = []; let x = x0;
  const L = {
    H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
    N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  };
  for (const ch of text) { for (const seg of L[ch]) out.push(seg.map(([u, v]) => [x + u * w, y0 - h / 2 + v * h])); x += w + gap; }
  return out;
}

function raster(lines, cap) {
  const size = cap === 'fat' ? 2.6 : 1.15, alpha = 0.16, stepDeg = 0.35;
  const pts = [];
  for (const line of lines) for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1], [x1, y1] = line[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / stepDeg));
    for (let k = 0; k <= n; k++) pts.push([r2(x0 + ((x1 - x0) * k) / n), r2(y0 + ((y1 - y0) * k) / n), size, alpha, 0]);
  }
  return pts;
}
const r2 = (v) => Math.round(v * 100) / 100;

let sql = `-- Seeded pieces around E7 (run after schema.sql)\n`;
for (const p of pieces) {
  const pts = raster(p.lines, p.cap);
  sql += `
with a as (insert into painters (name) values ('${p.author}') on conflict (name) do update set name = excluded.name returning id),
c as (insert into canvases (lat, lng, heading, title, author_id, author_name) select ${p.lat}, ${p.lng}, ${p.heading}, '${p.name}', a.id, '${p.author}' from a returning id, author_id)
insert into strokes (canvas_id, author_id, author_name, color, cap, points, paint_used)
select c.id, c.author_id, '${p.author}', '${p.color}', '${p.cap}', '${JSON.stringify(pts)}'::jsonb, ${Math.round(pts.length / 30 * 5)} from c;
`;
}
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql);
console.log('wrote supabase/seed.sql');
