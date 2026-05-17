# LINE setup

## 1. Create channels

Create these in LINE Developers Console:

- LINE Login channel for LIFF
- Messaging API channel for bot/webhook

## 2. Create LIFF app

In the LINE Login channel, create a LIFF app and set:

- Endpoint URL: your deployed HTTPS URL ending with `/line.html`
- Scope: `profile`, `openid`

Copy the LIFF ID into `.env`:

```env
LINE_LIFF_ID=your-liff-id
```

## 3. Configure Messaging API

In the Messaging API channel:

- Copy Channel access token into `LINE_CHANNEL_ACCESS_TOKEN`
- Copy Channel secret into `LINE_CHANNEL_SECRET`
- Set Webhook URL to your deployed HTTPS URL ending with `/api/line/webhook`
- Enable webhook

## 4. Optional push target

To push daily summaries, set `LINE_TARGET_ID` to a LINE user ID, group ID, or room ID.

During early testing, open `/line.html` through LIFF so the app can save your LINE profile to the backend.

## 5. Supported bot commands

Send these messages to the bot:

- `สรุป`
- `งาน`
- `เพิ่มงาน โทรหาลูกค้า`

The webhook will reply with a task summary or create a new task.
