# Cloudflare Worker: VisionHub backup notifications

This guide deploys a small authenticated JSON endpoint that receives VisionHub's existing `BACKUP_ALERT_WEBHOOK_URL` notifications and forwards them to either a Discord webhook or a Telegram chat.

The Worker is an optional adapter. It does not change the backup scheduler, access PostgreSQL, or run backup/restore commands.

## Files

- Worker implementation: [`examples/cloudflare/visionhub-alert-worker.js`](../examples/cloudflare/visionhub-alert-worker.js)
- Backup alert payload producer: [`scripts/backup-alerts.mjs`](../scripts/backup-alerts.mjs)
- Main backup runbook: [`BACKUP-RECOVERY.md`](BACKUP-RECOVERY.md)

## 1. Create the Cloudflare Worker

1. In the Cloudflare dashboard, open **Workers & Pages** and create a Worker.
2. Copy the contents of `examples/cloudflare/visionhub-alert-worker.js` into the Worker editor.
3. Deploy it and note the HTTPS `workers.dev` URL.
4. In the Worker settings, add the following as **Secrets** (not plain-text variables):

| Secret | Required | Purpose |
|---|---|---|
| `ACCESS_TOKEN` | Yes | Shared Bearer token used by VisionHub to authenticate requests |
| `DISCORD_WEBHOOK_URL` | If using Discord | Discord server's Incoming Webhook URL |
| `TELEGRAM_BOT_TOKEN` | If using Telegram | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` | If using Telegram | Destination chat/group ID |

Use a long random `ACCESS_TOKEN`; it is separate from the Discord and Telegram credentials. Configure only the destination provider you use. Never commit these values to the repository or put them in source code.

## 2. Configure VisionHub

Set the following in the deployment host's private `.env` file:

```dotenv
BACKUP_ALERT_WEBHOOK_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/
BACKUP_ALERT_WEBHOOK_TOKEN=replace-with-the-same-long-random-access-token
```

The scheduler sends a JSON `POST` with `Authorization: Bearer <token>`. Recreate the backup service after changing environment variables; use the same Compose file and overlays as your deployment. See [Backup Recovery](BACKUP-RECOVERY.md#1-configure-backup-alerts).

By default, the Worker sends notifications to **Discord**. To choose Telegram for an individual request, include `"platform":"telegram"` in that JSON payload. The existing VisionHub scheduler does not set `platform`, so it uses Discord by default. If Telegram is your only destination, the simplest option is to change the Worker default in `normalizeEvent` from `"discord"` to `"telegram"`.

## 3. Payload compatibility

The endpoint accepts the current VisionHub payload without requiring a `platform` property:

```json
{
  "application": "VisionHub",
  "event": "backup_alert_test",
  "severity": "info",
  "occurredAt": "2026-10-15T14:07:00.682Z",
  "mode": "managed",
  "phase": "manual_test",
  "message": "Manual test alert from the VisionHub backup scheduler.",
  "text": "VisionHub backup alert test | event=backup_alert_test | mode=managed | phase=manual_test | details=Manual test alert from the VisionHub backup scheduler.",
  "content": "VisionHub backup alert test | event=backup_alert_test | mode=managed | phase=manual_test | details=Manual test alert from the VisionHub backup scheduler."
}
```

The Worker turns the application, event, severity, mode, phase and timestamp into notification fields. It prefers `message` as the main message and falls back to `text` or `content`. It supports these events:

- `backup_failure`: local backup/validation/encryption failure
- `remote_upload_failure`: off-site upload failure
- `backup_recovered`: backup operation recovered
- `backup_alert_test`: manual test notification

Severity colors for Discord are `info`, `success`, `warning`, `error` and `critical`. The Worker suppresses Discord mentions and escapes Telegram HTML.

## 4. Test the Worker

Health check:

```sh
curl -i https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/
```

Expected: HTTP 200 with `{"ok":true,"service":"visionhub-alert-worker"}`.

Authenticated payload test (Discord default):

```sh
curl -i -X POST 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  --data '{
    "application":"VisionHub",
    "event":"backup_alert_test",
    "severity":"info",
    "occurredAt":"2026-10-15T14:07:00.682Z",
    "mode":"managed",
    "phase":"manual_test",
    "message":"Manual test alert from the VisionHub backup scheduler.",
    "text":"VisionHub backup alert test",
    "content":"VisionHub backup alert test"
  }'
```

Expected: HTTP 200 and `{"success":true,"platform":"discord","message":"Notification sent"}`, plus a Discord message. A wrong/missing token should return HTTP 401. Provider configuration or delivery errors return HTTP 502 without exposing credentials.

To test Telegram, add `"platform":"telegram"` to the JSON body. Do not paste tokens or full webhook URLs into logs, issue comments or chat.

## 5. Test from VisionHub

Run the existing side-effect-free scheduler test command from the repository root. Use the same Compose overlay list as your deployment:

```sh
docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml run --rm --no-deps backup --test-alert
```

For the existing database network, replace `infra/compose.database.yaml` with `infra/compose.existing-db-network.yaml` and include any other overlays your deployment needs. The command should report `BACKUP_ALERT_TEST_OK` and a message should arrive at the selected destination. This test does not contact PostgreSQL or modify backup state.

## Security notes

- Store `ACCESS_TOKEN`, Discord webhook URLs and Telegram bot tokens as Cloudflare Worker Secrets.
- Store `BACKUP_ALERT_WEBHOOK_TOKEN` only in the deployment's private environment file or secret manager. Never commit real values.
- Use HTTPS for the Worker endpoint; the Worker only accepts authenticated JSON POST requests for notifications.
- The request body is capped at 64 KiB, custom fields are bounded, upstream requests time out, redirects are not followed, and Discord mentions are disabled.
- The Worker returns generic delivery errors and does not log payloads, bot tokens, chat IDs or webhook URLs.
- Rotate credentials immediately if any secret is exposed. Restrict who can edit the Worker and read deployment secrets.
