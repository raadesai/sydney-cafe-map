-- Sydney Cafe Map — database schema.
-- Run this once in your Supabase project's SQL Editor to create the tables.
--
-- Security model: the browser uses the publishable (anon) key and can only
-- READ places (see the RLS policy below). All writes — adding places, ratings,
-- comments, photos — go through the Next.js API routes, which use the secret
-- key (SUPABASE_SECRET_KEY) behind a shared-password check and so bypass RLS.

-- ── places ───────────────────────────────────────────────────────────────
create table if not exists public.places (
  id                bigint generated always as identity primary key,
  type              text not null check (type in ('cafe', 'restaurant', 'hike', 'experience')),
  name              text not null,
  suburb            text not null,
  address           text,
  category          text check (category in ('lowkey', 'restaurant', 'bouj')),
  cuisine           text,
  notes             text,
  wifi              text,
  power_outlets     text,
  noise_level       text,
  rating_r          smallint check (rating_r between 1 and 10),  -- Rater One (see data/raters.ts)
  rating_m          smallint check (rating_m between 1 and 10),  -- Rater Two
  lat               double precision not null,
  lng               double precision not null,
  photos_updated_at timestamptz,
  created_at        timestamptz not null default now()
);

alter table public.places enable row level security;

-- Anyone (anon key) may read places; writes are server-side only.
create policy "places are publicly readable"
  on public.places for select
  using (true);

-- ── comments ─────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  place_id   bigint not null references public.places (id) on delete cascade,
  rater      text not null check (rater in ('R', 'M')),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- RLS on, no policy: comments are read and written only via the API routes
-- (secret key), never directly from the browser.
alter table public.comments enable row level security;
