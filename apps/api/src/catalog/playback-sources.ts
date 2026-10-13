import { BadRequestException } from "@nestjs/common";
import type { PlaybackSource } from "@visionhub/contracts";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new BadRequestException(`${field} 必须是文本。`);
  const result = value.trim();
  if (!result || result.length > maximum || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new BadRequestException(`${field} 不能为空且不能超过 ${maximum} 个字符。`);
  }
  return result;
}

function webUrl(value: unknown): string {
  const result = text(value, "直连播放地址", 4000);
  try {
    const url = new URL(result);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname ||
        url.username || url.password) throw new Error("invalid URL");
    return url.href;
  } catch {
    throw new BadRequestException("直连播放地址必须是有效且不含凭据的 HTTP 或 HTTPS URL。");
  }
}

/** Validate admin/API input and allow only the explicit fields in the source contract. */
export function parsePlaybackSources(value: unknown): PlaybackSource[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) {
    throw new BadRequestException("播放源必须是 JSON 数组，且每部作品最多配置 20 个播放源。");
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    const prefix = `播放源 #${index + 1}`;
    if (!isRecord(entry)) throw new BadRequestException(`${prefix} 格式无效。`);
    const id = text(entry.id, `${prefix} ID`, 64);
    const label = text(entry.label, `${prefix} 名称`, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) {
      throw new BadRequestException(`${prefix} ID 只能包含英文字母、数字、点、下划线和连字符。`);
    }
    if (seen.has(id)) throw new BadRequestException(`播放源 ID 重复：${id}`);
    seen.add(id);

    if (entry.kind === "direct") {
      const keys = Object.keys(entry).sort().join(",");
      if (keys !== "id,kind,label,url") {
        throw new BadRequestException(`${prefix} 的直连类型仅允许 id、label、kind、url 字段。`);
      }
      return { id, label, kind: "direct", url: webUrl(entry.url) };
    }

    if (entry.kind === "provider") {
      const keys = Object.keys(entry).sort().join(",");
      if (keys !== "contentId,id,kind,label,providerId") {
        throw new BadRequestException(`${prefix} 的源站类型仅允许 id、label、kind、providerId、contentId 字段。`);
      }
      const providerId = text(entry.providerId, `${prefix} 源站 ID`, 64);
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(providerId)) {
        throw new BadRequestException(`${prefix} 源站 ID 格式无效。`);
      }
      return {
        id,
        label,
        kind: "provider",
        providerId,
        contentId: text(entry.contentId, `${prefix} 远端内容 ID`, 512),
      };
    }

    throw new BadRequestException(`${prefix} 的 kind 只能是 direct 或 provider。`);
  });
}

/** Do not let malformed legacy JSON break public catalog responses. */
export function readStoredPlaybackSources(value: unknown): PlaybackSource[] {
  try {
    return parsePlaybackSources(value);
  } catch {
    return [];
  }
}
