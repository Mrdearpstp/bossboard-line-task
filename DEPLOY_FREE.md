# BossBoard free deploy checklist

## 1. Supabase database

1. Go to https://supabase.com/dashboard
2. Create a free project.
3. Open SQL Editor.
4. Paste and run `supabase/schema.sql`.
5. Open Project Settings -> API.
6. Copy:
   - Project URL -> `SUPABASE_URL`
   - service_role key -> `SUPABASE_SERVICE_ROLE_KEY`

Do not put the service role key in frontend JavaScript. Use it only in `.env` or Render environment variables.

## 2. Render web service

1. Push this project to GitHub.
2. Go to https://dashboard.render.com/
3. Create New -> Web Service.
4. Connect the GitHub repository.
5. Use:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
6. Add environment variables:
   - `LINE_LIFF_ID`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `PUBLIC_BASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

After Render gives a public HTTPS URL, set `PUBLIC_BASE_URL` to that URL.

## 3. LINE settings

1. Messaging API webhook URL:
   - `https://your-render-url.onrender.com/api/line/webhook`
2. LIFF Endpoint URL:
   - `https://your-render-url.onrender.com/line.html`
3. Keep LIFF URL for users:
   - `https://miniapp.line.me/<LINE_LIFF_ID>`

## 4. Quick health check

Open:

- `https://your-render-url.onrender.com/api/line/config`
- `https://your-render-url.onrender.com/line.html`

Then send `สรุป` in LINE and create/edit one task from LIFF.
