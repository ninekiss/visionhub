# VisionHub

影视内容浏览与播放应用。Web 使用 React/Vite，API 使用 NestJS/Prisma；片库数据存储在现有 PostgreSQL 的独立 `visionhub` schema 中。Docker Compose 只托管 web/api，不创建数据库容器。Web 是长期保留、可独立部署的一等客户端；Electron 桌面端将与 Web 共享页面、UI 组件和 API 契约，不会替换 Web。

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
- `configs/app.defaults.yaml`：提交到 Git 的非敏感默认值。
- `configs/app.development.yaml` / `configs/app.production.yaml`：环境专属覆盖值。
- `configs/desktop.yaml`：Electron 独立 API 地址，不修改 Web/API 服务器配置。
- 可选的 `configs/app.yaml` 和 `configs/secrets.yaml` 用作本地覆盖与秘密配置，已加入 Git/Docker 忽略规则。
- `.env`：数据库连接、管理员凭据和宿主机端口等环境变量，基于 `.env.example` 创建。敏感值不要提交到 Git。
- 合并优先级、变量映射和失败条件见 [配置说明](docs/CONFIGURATION.md)。

本地 API 的开发启动器会明确强制 `NODE_ENV=development`、开发配置文件和 `API_DEV_PORT`。配置按固定顺序合并，并在 API 创建 Nest 应用前由 Zod 校验；必需项缺失、YAML 无效或变量格式错误时会显示字段级错误，不会静默退回默认配置。Docker Compose 则明确设置 `NODE_ENV=production`、`PORT=3000` 并挂载生产配置。

## 本地开发

需要 Node.js 24.21.0（与仓库 `.nvmrc` 一致）、pnpm 12，以及已经运行且可访问的 PostgreSQL。

1. 将 `.env.example` 复制为根目录的 `.env`，配置真实的数据库连接。
2. 如果尚未初始化数据，在仓库根目录执行 `pnpm db:setup`。
3. 启动 Web 和开发 API：

```powershell
corepack enable
pnpm install
pnpm dev
```

Vite 会把本地的 `/api/*` 请求代理到 `http://127.0.0.1:3001`。如需更改端口，调整 `.env` 里的 `API_DEV_PORT`；Vite 会同步代理到相同端口。

核心验证命令：

```powershell
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` 会先构建 API，然后运行不依赖真实数据库的配置与片库服务单元测试。CI 会执行同样的测试及完整生产构建。

## Docker Compose 部署

配置 `.env` 中的 `EXISTING_DB_NETWORK`、`DATABASE_URL`、`DATABASE_URL_DOCKER`。数据库容器必须已经存在，并加入 `EXISTING_DB_NETWORK` 指定的网络。然后运行：

```powershell
docker compose --env-file .env up --build -d
```

Compose 只运行 Web 与 API，不会创建 PostgreSQL 容器。API 在容器内部固定监听 3000，默认发布到宿主机 3000；如要修改宿主机访问端口，只需更改 `API_PORT`，不影响容器内部 Nginx 的 `api:3000` 地址。Web 默认发布到宿主机 8080，可通过 `WEB_PORT` 调整。

## 管理后台

后台入口：`/admin`。首版包含内容总览、影视内容列表、作品新建/编辑、剧集分集管理和分类管理。所有写操作均由 API 服务端验证管理会话，前端隐藏导航不作为权限控制。

首次启用前，在根目录 `.env` 中配置专用管理员账号和会话密钥：

```dotenv
ADMIN_USERNAME=你的管理员账号
ADMIN_PASSWORD=替换为高强度唯一密码
ADMIN_SESSION_SECRET=至少32字符的随机密钥
ADMIN_COOKIE_SECURE=false
```

可用以下命令生成随机会话密钥：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

本地开发时，访问 `http://localhost:5173/admin`；Docker 部署默认从 `http://localhost:8080/admin` 进入。当前 Compose/Nginx 示例默认使用 HTTP，因此 `ADMIN_COOKIE_SECURE=false` 才能在该地址正常维持登录；若站点已通过 HTTPS 对外服务，请将它设为 `true`。不要把真实密码或会话密钥提交到 Git。若之前已经存在旧的 `.env`，需要手动追加这些新变量后重启 API 容器。

管理员 API 位于 `/api/v1/admin` 下。会话通过 HttpOnly、SameSite=Lax cookie 传递，8 小时过期。首版使用单管理员环境变量认证，不提供公开注册或多用户角色管理。

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

共享类型保存在 `packages/contracts/catalog.d.ts`，通过 `@visionhub/contracts` 提供给 Web 和 API。API 控制器不持有 Mock 数据；Mock 数据仅作为数据库种子来源。

## 详情与播放

- `/title/:id` 展示详情、元数据及选集。
- `/watch/:id` 播放电影或剧集第一集。
- `/watch/:id/:episodeId` 播放指定分集，支持浏览器前进/后退。
- Plyr 展示播放、缓冲、暂停和视频源错误状态。
- 当前各分集仍复用公开的 Plyr demo MP4，仅用于验证流程；接入真实版权视频源是后续工作。

## Web 与桌面端的关系

现有 `apps/web` 会持续保留并独立构建、部署。新增 Electron 桌面端是另一种客户端形态，不是 Web 的替代品。新增业务功能优先使用共享 React 页面/组件和统一 contracts；平台专属能力通过适配层隔离。每次涉及共享 UI 或业务流程的变更，都应验证 Web 构建和桌面端（建成后）的对应流程，避免两个客户端功能逐步分叉。完整路线见 [`docs/PLAN.md`](docs/PLAN.md)。

## 项目结构

```
apps/
  web/       React UI、Plyr 播放器、Vite
  api/       NestJS API、Prisma Client、数据库迁移与种子脚本
packages/
  config/    YAML/env 合并、Zod 校验与独立桌面配置加载
  contracts/ Web、Electron、API 共用的无依赖类型
configs/     开发、生产、桌面 YAML 配置
deploy/      Dockerfile 与 Nginx 配置
```
