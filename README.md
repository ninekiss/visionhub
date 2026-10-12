# VisionHub

影视内容浏览与播放应用。Web 使用 React/Vite，API 使用 NestJS/Prisma；片库数据存储在现有 PostgreSQL 的独立 `visionhub` schema 中。Docker Compose 只托管 web/api，不创建数据库容器。

## 技术栈

- pnpm workspace monorepo
- Web：React + TypeScript + Vite
- API：NestJS + TypeScript + Prisma ORM
- Player：[Plyr](https://github.com/sampotts/plyr) + HTML5 video
- Database：现有 PostgreSQL
- Runtime：Docker Compose（仅应用服务，连接已存在的外部数据库网络）

## 开发与部署配置

开发和部署使用不同的 API 端口及配置文件，避免本地调试 API 与 Docker API 争用同一个宿主机端口：

| 场景 | Web | API 进程/容器端口 | 宿主机访问地址 |
|---|---:|---:|---|
| 本地开发 `pnpm dev` | 5173 | 3001 | Web: `http://localhost:5173`，API: `http://localhost:3001` |
| Docker Compose | 容器 80 | 容器 3000 | Web: `http://localhost:8080`，API 可选映射为 `http://localhost:3000` |

配置文件分别是：

- `configs/app.development.yaml`：本地 API 端口 3001，允许本地 Vite 开发源。
- `configs/app.production.yaml`：部署容器内部端口 3000；浏览器通过 Nginx 同源访问 `/api`，无需开放跨域来源。
- `.env`：数据库连接和宿主机端口等环境变量，基于 `.env.example` 创建。敏感值不要提交到 Git。

本地 API 的开发启动器会明确强制 `NODE_ENV=development`、开发配置文件和 `API_DEV_PORT`，所以即使旧的根目录 `.env` 里还残留 `NODE_ENV=production` 或 `APP_CONFIG_PATH`，也不会让开发 API 偷偷监听部署端口。Docker Compose 则明确设置 `NODE_ENV=production`、`PORT=3000` 并挂载生产配置。

## 本地开发

需要 Node.js 22.13+、pnpm 12，以及已经运行且可访问的 PostgreSQL。

1. 将 `.env.example` 复制为根目录的 `.env`，配置真实的数据库连接。
2. 如果尚未初始化数据，在仓库根目录执行 `pnpm db:setup`。
3. 启动 Web 和开发 API：

```powershell
corepack enable
pnpm install
pnpm dev
```

Vite 会把本地的 `/api/*` 请求代理到 `http://127.0.0.1:3001`。如需更改端口，调整 `.env` 里的 `API_DEV_PORT`；Vite 会同步代理到相同端口。

## Docker Compose 部署

配置 `.env` 中的 `EXISTING_DB_NETWORK`、`DATABASE_URL`、`DATABASE_URL_DOCKER`。数据库容器必须已经存在，并加入 `EXISTING_DB_NETWORK` 指定的网络。然后运行：

```powershell
docker compose --env-file .env up --build -d
```

Compose 只运行 Web 与 API，不会创建 PostgreSQL 容器。API 在容器内部固定监听 3000，默认发布到宿主机 3000；如要修改宿主机访问端口，只需更改 `API_PORT`，不影响容器内部 Nginx 的 `api:3000` 地址。Web 默认发布到宿主机 8080，可通过 `WEB_PORT` 调整。

## 数据库设计与初始数据

Prisma schema 位于 `apps/api/prisma/schema.prisma`。片库使用独立的 PostgreSQL schema：`visionhub`。迁移历史也放在该 schema 中，避免与默认 `public` schema 内其他应用的迁移历史混用。

| 表 | 用途 |
|---|---|
| `visionhub.catalog_items` | 电影/剧集标题、简介、海报、视频源、年份、排序 |
| `visionhub.catalog_categories` | 题材分类字典 |
| `visionhub.catalog_item_categories` | 片目与分类的多对多关系 |
| `visionhub.catalog_episodes` | 剧集分集、顺序、简介、播放源和时长 |

迁移 SQL 位于 `apps/api/prisma/migrations/20261012000000_catalog_storage/migration.sql`。它只会创建 `visionhub` schema 下的这些对象，不会重命名、修改或删除旧的 `public.media_items` 表。运行迁移的数据库账号需要拥有创建 schema 和表的权限。

### 初始化步骤

在确认 `.env` 的连接串指向正确的现有 PostgreSQL 后，从仓库根目录运行：

```powershell
pnpm db:setup
```

该命令会创建 `visionhub` schema（若已存在则保持不动）、执行已提交的迁移、生成 Prisma Client，然后运行种子脚本。种子脚本复用 `apps/api/src/catalog/mock/catalog.mock-data.ts` 中的 Mock 记录，写入 12 部片目、6 条分集和对应分类。它通过稳定 ID 执行 upsert，可重复运行，不会删除这些 ID 之外的片目。

也可以分别运行 `pnpm db:migrate`、`pnpm db:seed`。数据库迁移由开发者显式执行，不会在 API 启动时自动运行。

## Catalog API

Base path：`/api/v1`。成功响应包含 `data`；片库列表同时返回分页元数据。接口从数据库读取数据，并保持现有前端使用的响应结构。

- `GET /catalog?q=space&category=科幻&page=1&pageSize=8` — 按标题、简介、分类搜索；精确匹配分类，支持分页。
- `GET /catalog/categories` — 返回当前被片目使用的分类名称。
- `GET /catalog/:id` — 片目详情，含 `mediaType` 和根据实际分集计算的 `episodeCount`。
- `GET /catalog/:id/episodes` — 返回剧集分集，电影返回空数组；不存在的 ID 返回 404。
- 可通过 `mediaType=series` 或 `mediaType=movie` 过滤格式。
- `page` 和 `pageSize` 必须为正整数；`pageSize` 上限为 50。

共享类型保存在 `contracts/catalog.d.ts`。API 控制器不持有 Mock 数据；Mock 数据仅作为数据库种子来源。

## 详情与播放

- `/title/:id` 展示详情、元数据及选集。
- `/watch/:id` 播放电影或剧集第一集。
- `/watch/:id/:episodeId` 播放指定分集，支持浏览器前进/后退。
- Plyr 展示播放、缓冲、暂停和视频源错误状态。
- 当前各分集仍复用公开的 Plyr demo MP4，仅用于验证流程；接入真实版权视频源是后续工作。

## 项目结构

```
apps/
  web/       React UI、Plyr 播放器、Vite
  api/       NestJS API、Prisma Client、数据库迁移与种子脚本
contracts/   Web/API 共用的无依赖类型
configs/     开发与部署 YAML 配置
deploy/      Dockerfile 与 Nginx 配置
```
