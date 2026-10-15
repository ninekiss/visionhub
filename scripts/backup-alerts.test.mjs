import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBackupAlertPayload,
  sanitizeAlertMessage,
  sendBackupAlert,
} from "./backup-alerts.mjs";

test("sanitizes database URLs, web URLs, and secret assignments", () => {
  const value = sanitizeAlertMessage(
    "connect failed postgresql://app:supersecret@db:5432/visionhub?schema=visionhub password=anothersecret https://host.example/private/token?x=1",
  );
  assert.doesNotMatch(value, /supersecret|anothersecret|private\/token|schema=visionhub/);
  assert.match(value, /postgresql:\/\/\[redacted\]/);
  assert.match(value, /password=\[redacted\]/);
  assert.match(value, /https:\/\/host\.example\/\[redacted-url\]/);
});

test("builds a structured recovery payload compatible with common webhook shapes", () => {
  const payload = buildBackupAlertPayload("backup_recovered", {
    mode: "managed",
    phase: "remote_upload_physical",
    message: "Upload succeeded after retry",
    consecutiveFailures: 3,
    retryMinutes: 15,
    failedAt: "2026-10-15T02:00:00.000Z",
    occurredAt: "2026-10-15T02:15:00.000Z",
  });

  assert.equal(payload.application, "VisionHub");
  assert.equal(payload.event, "backup_recovered");
  assert.equal(payload.severity, "info");
  assert.equal(payload.mode, "managed");
  assert.equal(payload.phase, "remote_upload_physical");
  assert.equal(payload.consecutiveFailures, 3);
  assert.equal(payload.retryMinutes, 15);
  assert.equal(payload.failedAt, "2026-10-15T02:00:00.000Z");
  assert.equal(payload.text, payload.content);
  assert.match(payload.text, /VisionHub backup recovered/);
});

test("posts JSON with optional bearer token without exposing credentials in the body", async () => {
  let captured;
  const result = await sendBackupAlert(
    "remote_upload_failure",
    {
      mode: "managed",
      phase: "remote_upload_logical",
      message: "failed for postgresql://user:password@db:5432/app",
      consecutiveFailures: 2,
      retryMinutes: 15,
    },
    {
      webhookUrl: "https://alerts.example.test/hooks/opaque-id",
      bearerToken: "test-secret-token",
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return { ok: true, status: 204 };
      },
    },
  );

  assert.deepEqual(result, { delivered: true, status: 204 });
  assert.equal(captured.url, "https://alerts.example.test/hooks/opaque-id");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.authorization, "Bearer test-secret-token");
  const body = JSON.parse(captured.init.body);
  assert.equal(body.event, "remote_upload_failure");
  assert.doesNotMatch(captured.init.body, /password@db|test-secret-token/);
});

test("does not throw when the webhook endpoint returns an error", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await sendBackupAlert(
      "backup_failure",
      { phase: "logical_backup", message: "disk full" },
      {
        webhookUrl: "https://alerts.example.test/hook",
        fetchImpl: async () => ({ ok: false, status: 503 }),
      },
    );
    assert.deepEqual(result, { delivered: false, reason: "http_error", status: 503 });
  } finally {
    console.warn = originalWarn;
  }
});

test("disabled webhooks are a no-op", async () => {
  let called = false;
  const result = await sendBackupAlert(
    "backup_failure",
    {},
    { webhookUrl: "", fetchImpl: async () => { called = true; return { ok: true, status: 200 }; } },
  );
  assert.deepEqual(result, { delivered: false, disabled: true });
  assert.equal(called, false);
});

test("rejects webhook URLs with embedded credentials", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    let called = false;
    const result = await sendBackupAlert(
      "backup_failure",
      {},
      {
        webhookUrl: "https://user:password@alerts.example.test/hook",
        fetchImpl: async () => { called = true; return { ok: true, status: 200 }; },
      },
    );
    assert.deepEqual(result, { delivered: false, reason: "invalid_configuration" });
    assert.equal(called, false);
  } finally {
    console.warn = originalWarn;
  }
});
