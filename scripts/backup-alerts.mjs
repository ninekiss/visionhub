const EVENT_META = {
  backup_failure: { severity: "error", label: "VisionHub backup failed" },
  remote_upload_failure: { severity: "error", label: "VisionHub off-site backup failed" },
  backup_recovered: { severity: "info", label: "VisionHub backup recovered" },
  backup_alert_test: { severity: "info", label: "VisionHub backup alert test" },
};

export function sanitizeAlertMessage(value) {
  return String(value ?? "Unknown error")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'\x60<>]+/gi, "postgresql://[redacted]")
    .replace(/\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET(?:_ACCESS)?_KEY|ACCESS_KEY_ID|SESSION_TOKEN|TOKEN|AUTHORIZATION))\b(\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi, "$1$2[redacted]")
    .replace(/https?:\/\/[^\s"'\x60<>]+/gi, (match) => {
      try {
        const parsed = new URL(match);
        return `${parsed.protocol}//${parsed.host}/[redacted-url]`;
      } catch {
        return "[redacted-url]";
      }
    })
    .slice(0, 1000);
}

export function buildBackupAlertPayload(event, details = {}) {
  const meta = EVENT_META[event] ?? { severity: "warning", label: "VisionHub backup notification" };
  const message = sanitizeAlertMessage(details.message ?? "");
  const phase = String(details.phase ?? "unknown");
  const mode = String(details.mode ?? process.env.BACKUP_DATABASE_MODE ?? "direct");
  const consecutiveFailures = Number.isInteger(details.consecutiveFailures)
    ? details.consecutiveFailures
    : undefined;
  const retryMinutes = Number.isInteger(details.retryMinutes)
    ? details.retryMinutes
    : undefined;
  const occurredAt = String(details.occurredAt ?? new Date().toISOString());
  const parts = [
    meta.label,
    `event=${event}`,
    `mode=${mode}`,
    `phase=${phase}`,
    consecutiveFailures === undefined ? "" : `consecutive_failures=${consecutiveFailures}`,
    retryMinutes === undefined ? "" : `retry_minutes=${retryMinutes}`,
    message ? `details=${message}` : "",
  ].filter(Boolean);
  const text = parts.join(" | ");

  return {
    application: "VisionHub",
    event,
    severity: meta.severity,
    occurredAt,
    mode,
    phase,
    ...(message ? { message } : {}),
    ...(consecutiveFailures === undefined ? {} : { consecutiveFailures }),
    ...(retryMinutes === undefined ? {} : { retryMinutes }),
    ...(details.failedAt ? { failedAt: String(details.failedAt) } : {}),
    // text works with common Slack-style incoming webhooks; content works with
    // Discord-style webhooks. Generic webhook consumers can use the full object.
    text,
    content: text,
  };
}

export async function sendBackupAlert(event, details = {}, options = {}) {
  const webhookUrl = options.webhookUrl ?? process.env.BACKUP_ALERT_WEBHOOK_URL ?? "";
  const bearerToken = options.bearerToken ?? process.env.BACKUP_ALERT_WEBHOOK_TOKEN ?? "";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!String(webhookUrl).trim()) return { delivered: false, disabled: true };

  let endpoint;
  try {
    endpoint = new URL(String(webhookUrl));
    if (
      !["https:", "http:"].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password
    ) {
      throw new Error("Webhook URL must be HTTP(S) without embedded credentials.");
    }
  } catch {
    console.warn(`[backup-alerts] Invalid webhook URL configuration; ${event} was not delivered.`);
    return { delivered: false, reason: "invalid_configuration" };
  }

  const payload = buildBackupAlertPayload(event, details);
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (String(bearerToken).trim()) headers.authorization = `Bearer ${String(bearerToken).trim()}`;

  try {
    const response = await fetchImpl(endpoint.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    if (!response.ok) {
      console.warn(`[backup-alerts] Webhook returned HTTP ${response.status}; ${event} was not delivered.`);
      return { delivered: false, reason: "http_error", status: response.status };
    }
    console.info(`[backup-alerts] Delivered event ${event}.`);
    return { delivered: true, status: response.status };
  } catch {
    // Do not print endpoint URLs, bearer tokens, or transport details which can
    // contain provider-specific identifiers. Alert delivery must not break backups.
    console.warn(`[backup-alerts] Webhook delivery failed; ${event} was not delivered.`);
    return { delivered: false, reason: "network_error" };
  }
}
