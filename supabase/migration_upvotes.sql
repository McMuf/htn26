-- Upvotes on pieces (a piece = one canvas, never a single stroke).
--
-- PURELY ADDITIVE. Adds one column to canvases and one new table; touches no existing
-- column, policy, trigger or function on canvases, strokes, painters or reports.
--
-- Paste into the Supabase SQL editor AFTER schema.sql. Re-runnable, like seed.sql.
--
-- One vote per painter per canvas, toggleable. The composite primary key IS the
-- double-vote guard, so no client can get it wrong. canvases.upvotes is a
-- denormalised counter kept in sync by a trigger, the same shape as reports -> flags,
-- so the leaderboard is one indexed read instead of a counting join.

alter table canvases add column if not exists upvotes integer not null default 0;

create table if not exists upvotes (
  canvas_id uuid not null references canvases(id) on delete cascade,
  painter_id uuid not null references painters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (canvas_id, painter_id)
);

create index if not exists upvotes_painter_idx on upvotes(painter_id);
create index if not exists canvases_upvotes_idx on canvases(upvotes desc);

-- Keep canvases.upvotes in step with the rows, in both directions.
-- security definer: canvases has select and insert policies but no update policy, so a trigger
-- running as the caller would match zero rows under RLS and silently fail to move the counter.
-- increment_views() solves the same problem the same way.
create or replace function on_upvote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update canvases set upvotes = upvotes + 1 where id = new.canvas_id;
    return new;
  else
    update canvases set upvotes = greatest(0, upvotes - 1) where id = old.canvas_id;
    return old;
  end if;
end $$;

drop trigger if exists upvotes_count_ins on upvotes;
create trigger upvotes_count_ins after insert on upvotes for each row execute function on_upvote();
drop trigger if exists upvotes_count_del on upvotes;
create trigger upvotes_count_del after delete on upvotes for each row execute function on_upvote();

alter table upvotes enable row level security;

-- Votes are public so the UI can show whether you have already voted; you may only
-- add or remove your own.
drop policy if exists "read upvotes" on upvotes;
create policy "read upvotes" on upvotes for select using (true);
drop policy if exists "own upvote" on upvotes;
create policy "own upvote" on upvotes for all using (auth.uid() = painter_id) with check (auth.uid() = painter_id);

-- One round trip for the whole toggle, and it cannot race with itself: returns the
-- new count and whether the caller now has a vote on this piece.
create or replace function toggle_upvote(cid uuid)
returns table (new_count integer, voted boolean)
language plpgsql security invoker as $$
declare
  me uuid := auth.uid();
  had boolean;
begin
  if me is null then
    raise exception 'sign in to vote';
  end if;

  select exists(select 1 from upvotes u where u.canvas_id = cid and u.painter_id = me) into had;

  if had then
    delete from upvotes u where u.canvas_id = cid and u.painter_id = me;
  else
    insert into upvotes (canvas_id, painter_id) values (cid, me)
      on conflict (canvas_id, painter_id) do nothing;
  end if;

  return query
    select c.upvotes, not had from canvases c where c.id = cid;
end $$;

-- The board: the most-upvoted pieces, with whether the caller has voted on each, so
-- the list renders in one request.
create or replace function top_pieces(lim integer default 20)
returns table (
  id uuid,
  title text,
  author_id uuid,
  author_name text,
  upvotes integer,
  views integer,
  stroke_count integer,
  created_at timestamptz,
  lat double precision,
  lng double precision,
  voted boolean
)
language sql stable as $$
  select c.id, c.title, c.author_id, c.author_name, c.upvotes, c.views, c.stroke_count,
         c.created_at, c.lat, c.lng,
         exists(select 1 from upvotes u where u.canvas_id = c.id and u.painter_id = auth.uid())
  from canvases c
  where not c.flagged
  order by c.upvotes desc, c.stroke_count desc, c.created_at desc
  limit greatest(1, least(coalesce(lim, 20), 100));
$$;

-- Which of these pieces have I voted on? Used to hydrate the discovery card in bulk.
create or replace function my_upvotes(ids uuid[])
returns setof uuid language sql stable as $$
  select u.canvas_id from upvotes u
  where u.painter_id = auth.uid() and u.canvas_id = any(ids);
$$;

-- Recount from the rows, so any vote cast while the trigger was blocked is picked up and a
-- re-run always converges on the truth.
update canvases c set upvotes = coalesce(v.n, 0)
from (select canvas_id, count(*)::int as n from upvotes group by canvas_id) v
where v.canvas_id = c.id and c.upvotes is distinct from v.n;

update canvases c set upvotes = 0
where c.upvotes <> 0 and not exists (select 1 from upvotes u where u.canvas_id = c.id);
