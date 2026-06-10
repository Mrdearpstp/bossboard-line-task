# BossBoard Cloudflare Migration

This migration is intentionally staged so the live Render/Supabase app remains usable while each Cloudflare piece is tested.

## Phase 1: Cloudflare Pages frontend

Status: prepared in this repo.

- Static files are built into `dist/`.
- `/api/*` is proxied back to the current Render service.
- `/brand/*` is proxied back to Render until brand images are moved into the Cloudflare static bundle.
- Supabase remains the database through the existing Render backend.

Build locally:

```bash
npm run build:cloudflare
```

Cloudflare Pages settings:

- Framework preset: None
- Build command: `npm run build:cloudflare`
- Build output directory: `dist`
- Functions directory: `functions`
- Environment variable: `RENDER_ORIGIN=https://bossboard-line-task.onrender.com`

After Pages deploys, test:

- `/line.html`
- `/api/line/config`
- `/brand/bossboard-mascot.png`

Only after these pass should the LINE MINI App endpoint be changed to the Cloudflare Pages URL.

## Phase 2: Move API/Webhook to Workers or Pages Functions

Next step after Phase 1 is stable.

- Port `/api/line/webhook`
- Port `/api/line/config`
- Port task/project APIs
- Keep Supabase as the database temporarily

## Phase 3: Move data from Supabase to D1

Next step after API routes work on Cloudflare.

- Create D1 database
- Replace the single JSON state table with D1 tables
- Migrate tasks, projects, line users, line targets, users, organizations, members, and reminder settings

## Phase 4: Cloudflare-native reminders

- Use Cron Triggers for reminder ticks
- Optionally add Queues if notification volume grows
