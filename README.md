# VisionHub

影视内容浏览与播放应用。Web 使用 React/Vite，API 使用 NestJS/Prisma；片库数据存储在现有 PostgreSQL 的独立 `visionhub` schema 中。Docker Compose 只托管 web/api，不创建数据库容器。

## 技术栈

- pnpm workspace monorepo
- Web：React + TypeScript + Vite
- API：NestJS + TypeScript + Prisma ORM
- Player：[Plyr](https://github.com/sampotts/plyr) + HTML5 video
- Database：现有 PostgreSQL
- Runtime：Docker Compose（仅应用服务，连接已存在的外部数据库网络）

## 本地开发

需要 Node.js 22.13+、pnpm 12、以及已经运行且可访问的 PostgreSQL。

1. 将 `.env.example` 复制为根目录的 `.env`。
2. 将 `DATABASE_URL` 设置为**宿主机可以访问**的 PostgreSQL 连接串；将 `DATABASE_URL_DOCKER` 设置为 API 容器通过外部 Docker 网络可以访问的地址。
3. 在仓库根目录执行：

```powershell
corepack enable
pnpm install
Copy-Item configs/app.example.yaml configs/app.yaml
pnpm db:setup
pnpm dev
```

Web 默认运行于 http://localhost:5173，API 默认运行于 http://localhost:3000。数据库初始化完成后，片库 API 从 PostgreSQL 读取数据；启动 API 不会自动执行迁移。

## Docker Compose

先配置根目录 `.env` 中的 `EXISTING_DB_NETWORK`、`DATABASE_URL` 和 `DATABASE_URL_DOCKER`。数据库容器必须已经存在，且加入 `EXISTING_DB_NETWORK` 指定的网络。然后运行：

```powershell
docker compose --env-file .env up --build
```

Compose 不创建 PostgreSQL 服务。容器内 API 使用 `DATABASE_URL_DOCKER`；在宿主机运行 `pnpm db:setup` 时使用 `DATABASE_URL`。这两个地址可以不同，但必须指向同一个数据库。示例中的主机名和凭据必须替换成现有数据库的真实配置。

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

也可以分别运行 `pnpm db:migrate`、`pnpm db:seed`。当前代码提交包含迁移和种子脚本；实际数据库写入需在拥有 `DATABASE_URL` 的环境中执行上述命令，本仓库提交过程不会代替你连接或修改外部数据库。

## Catalog API

Base path：`/api/v1`。成功响应包含 `data`；片库列表同时返回分页元数据。接口现在读取数据库，但保留现有前端使用的响应结构。

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
configs/     应用配置样例
deploy/      Dockerfile 与 Nginx 配置
```
