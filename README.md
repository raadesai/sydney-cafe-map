# Sydney Cafe Map

A personal, map-first guide to cafés, restaurants, hikes, and experiences around
Sydney — built for two people to rate places out of 10 and keep notes on the
things that matter (wifi, power outlets, noise, cuisine, photos, comments).

Anyone can browse the map read-only; editing (adding places, ratings, photos,
comments) is unlocked with a shared password. It's a [Next.js](https://nextjs.org)
app backed by [Supabase](https://supabase.com), with map tiles from
[MapTiler](https://www.maptiler.com), photo storage on
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob), and optional web-push
notifications.

## Features

- **MapLibre** map of every place, coloured by rater and filterable by type
  (`cafe` / `restaurant` / `hike` / `experience`) and category (`lowkey` /
  `restaurant` / `bouj`).
- **Two-rater scoring** (1–10 each) — the two people are defined in
  [`data/raters.ts`](data/raters.ts); change the names/colours to your own.
- **Add-a-place flow** that geocodes an address (or a Google Maps link) via
  MapTiler.
- **Photos** per place (Vercel Blob) and **comments** per rater.
- **Password-gated editing** — read-only by default; enter the shared password
  to edit. View-only devices never see the write APIs.
- **Web-push** notifications (VAPID) and installable as a PWA.

## Setup

### 1. Install

```bash
git clone https://github.com/raadesai/sydney-cafe-map.git
cd sydney-cafe-map
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. SQL Editor → paste and run [`supabase/schema.sql`](supabase/schema.sql). This
   creates the `places` and `comments` tables with the right constraints and
   row-level security (browsers can only read; writes go through the API).

### 3. Environment

```bash
cp .env.example .env.local
```

Fill in every value — see the comments in [`.env.example`](.env.example) for
where each one comes from. In short you'll need: Supabase URL + publishable +
secret keys, a MapTiler key, a chosen edit password (`ADD_PLACE_SECRET`), a
Vercel Blob token, and a VAPID keypair (`npx web-push generate-vapid-keys`).

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The map starts empty;
unlock editing with your password and add your first place.

## Deploy

Deploy on [Vercel](https://vercel.com/new): import the repo, add the same
environment variables in Project Settings → Environment Variables, and create a
Blob store. Pushes to `main` deploy automatically.

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
MapLibre GL · Supabase · Vercel Blob · web-push.

## License

MIT — see [LICENSE](LICENSE).
