-- AR anchoring: strokes now carry their ARKit anchor + transform, canvases carry a saved ARWorldMap.
-- Run once after schema.sql (safe to re-run).
alter table canvases add column if not exists world_map_path text;
alter table canvases add column if not exists world_map_updated_at timestamptz;
alter table strokes add column if not exists anchor_id text;
alter table strokes add column if not exists transform jsonb;

-- world maps live in a public storage bucket
insert into storage.buckets (id, name, public) values ('worldmaps', 'worldmaps', true)
on conflict (id) do update set public = true;
drop policy if exists "worldmaps read" on storage.objects;
drop policy if exists "worldmaps write" on storage.objects;
create policy "worldmaps read" on storage.objects for select using (bucket_id = 'worldmaps');
create policy "worldmaps write" on storage.objects for insert to authenticated with check (bucket_id = 'worldmaps');
drop policy if exists "worldmaps update" on storage.objects;
create policy "worldmaps update" on storage.objects for update to authenticated using (bucket_id = 'worldmaps');

-- painters may update the world map of any canvas they can see (last writer wins)
drop policy if exists "update canvas map" on canvases;
create policy "update canvas map" on canvases for update to authenticated using (true) with check (true);
