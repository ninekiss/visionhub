const MAX_BODY_BYTES = 64 * 1024;
const MAX_TEXT_LENGTH = 4000;
const MAX_FIELDS = 10;
const SEVERITY_COLORS = {
  info: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
  critical: 0x992d22,
};

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return json({ ok: true, service: "visionhub-alert-worker" });
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405, { allow: "GET, POST" });
    }

    try {
      if (!env.ACCESS_TOKEN) {
        return json({ error: "Worker is not configured" }, 500);
      }
      if (!authorized(request, env.ACCESS_TOKEN)) {
        return json({ error: "Unauthorized" }, 401);
      }

      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return json({ error: "Content-Type must be application/json" }, 415);
      }

      const declaredLength = Number(request.headers.get("content-length") || 0);
      if (declaredLength > MAX_BODY_BYTES) {
        return json({ error: "Request body too large" }, 413);
      }
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return json({ error: "Request body too large" }, 413);
      }

      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return json({ error: "JSON body must be an object" }, 400);
      }

      const notification = normalizeEvent(input);
      const result = notification.platform === "telegram"
        ? await sendTelegram(notification, env)
        : await sendDiscord(notification, env);

      if (!result.ok) {
        console.error("Notification provider returned an error", {
          platform: notification.platform,
          status: result.status,
        });
        return json({ error: "Notification delivery failed", platform: notification.platform }, 502);
      }
      return json({ success: true, platform: notification.platform, message: "Notification sent" });
    } catch (error) {
      console.error("Alert Worker request failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return json({ error: "Invalid notification request" }, 400);
    }
  },
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

function authorized(request, expected) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const actual = match[1];
  // Constant-time comparison for equal-length UTF-8 token values.
  const a = new TextEncoder().encode(actual);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function optionalString(value, name, max = 500) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${name} is too long`);
  return result;
}

function normalizeEvent(input) {
  const platform = optionalString(input.platform, "platform", 20).toLowerCase() || "discord";
  if (!["discord", "telegram"].includes(platform)) throw new Error("platform must be discord or telegram");

  const application = optionalString(input.application, "application", 100) || "VisionHub";
  const event = optionalString(input.event, "event", 100);
  const severity = (optionalString(input.severity, "severity", 20) || "info").toLowerCase();
  if (!["info", "success", "warning", "error", "critical"].includes(severity)) {
    throw new Error("severity is unsupported");
  }

  const occurredAt = optionalString(input.occurredAt, "occurredAt", 80);
  if (occurredAt && Number.isNaN(Date.parse(occurredAt))) throw new Error("occurredAt must be a valid date");
  const mode = optionalString(input.mode, "mode", 100);
  const phase = optionalString(input.phase, "phase", 100);
  const title = optionalString(input.title, "title", 256) || eventLabel(event) || application;
  const message = optionalString(
    typeof input.message === "string" && input.message.trim()
      ? input.message
      : typeof input.text === "string" && input.text.trim()
        ? input.text
        : input.content,
    "message",
    MAX_TEXT_LENGTH,
  );

  const fields = [];
  for (const [name, value] of [
    ["Application", application],
    ["Event", event],
    ["Severity", severity.toUpperCase()],
    ["Mode", mode],
    ["Phase", phase],
    ["Occurred at", occurredAt],
  ]) {
    if (value) fields.push({ name, value });
  }
  if (Array.isArray(input.fields)) {
    if (input.fields.length > MAX_FIELDS) throw new Error(`fields may contain at most ${MAX_FIELDS} entries`);
    for (const field of input.fields) {
      if (!field || typeof field !== "object" || Array.isArray(field)) throw new Error("each field must be an object");
      const name = optionalString(field.name, "field.name", 256);
      const value = optionalString(field.value, "field.value", 1024);
      if (name && value) fields.push({ name, value });
    }
  }

  let color = SEVERITY_COLORS[severity];
  if (input.color !== undefined) {
    if (typeof input.color === "number" && Number.isInteger(input.color) && input.color >= 0 && input.color <= 0xffffff) {
      color = input.color;
    } else if (typeof input.color === "string" && /^#?[0-9a-f]{6}$/i.test(input.color)) {
      color = Number.parseInt(input.color.replace(/^#/, ""), 16);
    } else {
      throw new Error("color must be a 6-digit hex string or a 24-bit integer");
    }
  }

  if (!message && fields.length === 0) throw new Error("message, text, content, or fields is required");
  return { platform, application, event, severity, occurredAt, mode, phase, title, message, fields, color };
}

function eventLabel(event) {
  const labels = {
    backup_failure: "VisionHub backup failed",
    remote_upload_failure: "VisionHub off-site backup failed",
    backup_recovered: "VisionHub backup recovered",
    backup_alert_test: "VisionHub backup alert test",
  };
  return labels[event] || "";
}

async function sendDiscord(note, env) {
  const endpoint = env.DISCORD_WEBHOOK_URL;
  if (!endpoint) return { ok: false, status: 0 };

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, status: 0 };
  }
  if (url.protocol !== "https:" ||
      !["discord.com", "discordapp.com"].includes(url.hostname) ||
      !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)) {
    return { ok: false, status: 0 };
  }

  const fields = note.fields.slice(0, MAX_FIELDS).map((field) => ({
    name: field.name.slice(0, 256),
    value: field.value.slice(0, 1024),
    inline: true,
  }));
  const description = note.message.slice(0, 4000);
  const embed = {
    title: note.title.slice(0, 256),
    description,
    color: note.color,
    fields,
    ...(note.occurredAt ? { timestamp: new Date(note.occurredAt).toISOString() } : {}),
  };
  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
  });
  return { ok: response?.ok === true, status: response?.status ?? 0 };
}

async function sendTelegram(note, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) return { ok: false, status: 0 };

  const lines = [
    `<b>${escapeHtml(note.title)}</b>`,
    note.message ? escapeHtml(note.message) : "",
    ...note.fields.map((field) => `<b>${escapeHtml(field.name)}:</b> ${escapeHtml(field.value)}`),
  ].filter(Boolean);
  const text = lines.join("\n");
  if (text.length > MAX_TEXT_LENGTH) return { ok: false, status: 0 };

  const response = await safeFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!response?.ok) return { ok: false, status: response?.status ?? 0 };
  try {
    const data = await response.json();
    return { ok: data.ok === true, status: response.status };
  } catch {
    return { ok: false, status: response.status };
  }
}

async function safeFetch(url, init) {
  try {
    return await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[char]);
}
