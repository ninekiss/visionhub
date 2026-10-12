# VisionHub

影视内容浏览与播放应用的基础脚手架。当前阶段先完成 UI、Plyr 播放器接入、Mock API、容器化运行骨架；不创建数据库容器，也不修改现有数据库。

## 技术栈

- pnpm workspace monorepo
- Web: React + TypeScript + Vite + Tailwind CSS
- API: NestJS + TypeScript
- Player: [Plyr](https://github.com/sampotts/plyr)，通过 HTML5 video 播放器接入
- Database: existing PostgreSQL, Prisma schema/client scaffold
- Runtime: Docker Compose（仅托管 web/api 应用服务）

## Requirements

- Node.js current LTS
- pnpm
- Docker Engine + Compose
- 已存在并可访问的 PostgreSQL 容器网络

## Local development

```bash
corepack enable
pnpm install
cp configs/app.example.yaml configs/app.yaml
pnpm dev
```

Web 默认运行于 http://localhost:5173，API 默认运行于 http://localhost:3000。当前 API 返回 Mock 数据，不要求数据库可用。

## Docker Compose

将 `.env.example` 复制为 `.env`，设置现有数据库容器所在的 Docker network 名称。Compose 不声明数据库服务，只将应用连接到已存在的 external network。

```bash
cp .env.example .env
docker compose --env-file .env up --build
```

如果数据库容器与应用使用的网络名称不同，修改 `EXISTING_DB_NETWORK`。应用配置放在 `configs/app.yaml`；密钥与部署差异通过环境变量注入，不要提交真实密钥。

## Configuration

- `configs/app.example.yaml`: 应用默认配置模板
- `.env.example`: Compose 与运行时环境变量模板
- `apps/api/prisma/schema.prisma`: 数据模型起点，暂不执行迁移
- API 的 `/api/v1/catalog` 和 `/api/v1/catalog/:id` 使用 Mock 数据

## Mock catalog API

Base path: `/api/v1`. All successful responses use a `data` field. The list endpoint returns pagination metadata alongside the data array.

- `GET /catalog?q=space&category=科幻&page=1&pageSize=8` — case-insensitive search across title, description and categories, exact category filtering, and pagination. `page` defaults to 1; `pageSize` defaults to `catalog.pageSize` in the app config and is capped at 50.
- `GET /catalog/categories` — available category values from the active catalog source.
- `GET /catalog/:id` — one catalog item including `mediaType` and `episodeCount`; unknown IDs return 404.
- `GET /catalog/:id/episodes` — episode list for a series (an empty array for movies).
- Add `mediaType=series` or `mediaType=movie` to the list query to filter by format.
- Invalid page values return 400.

List response:

```json
{
  "data": [
    {
      "id": "1",
      "title": "星际回响",
      "year": 2026,
      "categories": ["科幻", "剧情"],
      "description": "一段来自深空的微弱信号。",
      "poster": "https://example.com/poster.jpg",
      "videoUrl": "https://example.com/video.mp4"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 8,
    "totalItems": 12,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

The shared response and catalog types live in `contracts/catalog.d.ts`; Mock records and episode records are separated into `apps/api/src/catalog/mock/catalog.mock-data.ts`, so controllers don't own data and the UI consumes the same contract.

## Detail and playback flow

- `/title/:id` displays a title detail page, metadata and episode selection.
- `/watch/:id` opens a movie or defaults to the first episode of a series.
- `/watch/:id/:episodeId` opens a specific episode. Browser Back/Forward are supported.
- Playback status, buffering and media-source failures are reflected in the UI. The series episode URLs currently reuse the public Plyr demo MP4 as scaffold data.
- Playback progress is saved locally in the current browser and shown in the home page's "继续观看" section. It restores the last position for the same movie/episode; finishing an item removes it from the continue-watching list. This is device-local only and does not sync between browsers or accounts.

## Project layout

```
apps/
  web/       React UI, Plyr player, Vite
  api/       NestJS API, Prisma schema, Mock endpoints
configs/     externalized application config
deploy/      Dockerfiles
```

## Notes

Plyr 是播放器 UI 层，不负责解码所有流媒体协议。后续接入 HLS 时可在其上增加 hls.js 适配；当前脚手架先用原生 HTML5 video 和示例 MP4 验证播放器生命周期。
