# VisionHub

影视内容浏览与播放应用。Web 使用 React/Vite，API 使用 NestJS/Prisma；片库数据存储在 PostgreSQL 的独立 `visionhub` schema 中。默认 Compose 只启动 web/api；可按需通过单独的 Compose 文件启动 PostgreSQL，或连接现有数据库网络。Web 是长期保留、可独立部署的一等客户端；Electron 桌面端与 Web 共享页面、UI 组件和 API 契约，不会替换 Web。

## 技术栈

- pnpm workspace monorepo
- Web：React + TypeScript + Vite
- API：NestJS + TypeScript + Prisma ORM
- Player：[Plyr](https://github.com/sampotts/plyr) + HTML5 video
- Shared UI：`packages/ui` provides shared design tokens and Tailwind-based React primitives
- Database：现有 PostgreSQL
- Runtime：Docker Compose（应用服务默认启动；数据库容器和外部数据库网络均按需选择）

## 开发与部署配置

开发和部署使用不同的 API 端口及配置文件，避免本地调试 API 与 Docker API 争用同一个宿主机端口：

| 场景 | Web | API 进程/容器端口 | 宿主机访问地址 |
|---|---:|---:|---|
| 本地开发 `pnpm dev` | 5173 | 3001 | Web: `http://localhost:5173`，API: `http://localhost:3001` |
| Docker Compose | 容器 80 | 容器 3000（内部） | Web: `http://localhost:8080`；API 默认不发布端口，可通过独立 overlay 映射到 `127.0.0.1:3000` |

配置文件分别是：

- `configs/app.development.yaml`：本地 API 端口 3001，允许本地 Vite 开发源。
- `configs/app.defaults.yaml`：提交到 Git 的非敏感默认值。
- `configs/app.development.yaml` / `configs/app.production.yaml`：环境专属覆盖值。
- `configs/desktop.yaml`：Electron 独立 API 地址，不修改 Web/API 服务器配置。
- 可选的 `configs/app.yaml` 和 `configs/secrets.yaml` 用作本地覆盖与秘密配置，已加入 Git/Docker 忽略规则。
- `.env`：数据库连接、管理员凭据和宿主机端口等环境变量，基于 `.env.example` 创建。敏感值不要提交到 Git。
- 合并优先级、变量映射和失败条件见 [配置说明](docs/CONFIGURATION.md)。
- Compose 部署方式、数据库连接、备份和回滚见 [部署说明](docs/DEPLOYMENT.md)。

本地 API 的开发启动器会明确强制 `NODE_ENV=development`、开发配置文件和 `API_DEV_PORT`。配置按固定顺序合并，并在 API 创建 Nest 应用前由 Zod 校验；必需项缺失、YAML 无效或变量格式错误时会显示字段级错误，不会静默退回默认配置。Docker Compose 则明确设置 `NODE_ENV=production`、`PORT=3000` 并挂载生产配置。

## 本地开发

需要 Node.js 24.21.0（与仓库 `.nvmrc` 一致）、pnpm 12，以及一个可访问的 PostgreSQL。可以使用已有实例，也可以按需启动 Compose 提供的本地数据库服务。

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

`pnpm test` 会先运行共享配置包测试，再构建 API，最后运行不依赖真实数据库的 API 单元测试。CI 会执行同样的测试及完整生产构建。

## Electron 桌面端开发壳（P4.1–P4.3）

首个打包目标确定为 macOS Apple Silicon（ARM64）。已建立 Electron 主进程、受限 preload bridge 和复用现有 Web renderer 的开发壳；当前分支为打包版 renderer 引入受限的 `visionhub://app` 协议，并为 HTML 主文档设置 CSP 响应头。**这仍不是可发布的安装包**。主进程通过 `loadDesktopConfig()` 读取 API 地址，并将 `/api/v1` 请求代理到该地址，保持渲染器同源；macOS 签名/公证/自动发布属于 P4.5。

在一个终端启动开发 API（需要现有 PostgreSQL 可访问）：

```powershell
pnpm --filter @visionhub/api dev
```

在另一个终端启动 Electron 与独立 Vite renderer（使用 5174 端口，不抢占 Web 默认的 5173）：

```powershell
pnpm dev:desktop
```

可分别运行桌面壳的检查和安全边界单元测试：

```powershell
pnpm --filter @visionhub/desktop build
pnpm --filter @visionhub/desktop test
```

开发壳复用 `apps/web` 的全部 React 页面和组件。`pnpm --filter @visionhub/desktop build` 会额外生成独立的 `apps/desktop/renderer-dist`，由 Electron 主进程注册的 `visionhub://app` 协议提供静态资源与 CSP；不通过 `file://` 加载打包页面，浏览器 Web 的默认构建仍使用原来的 Vite 配置。打包 renderer 通过主进程将 `/api/v1` 同源请求代理到 `configs/desktop.yaml` 中的 API 地址；可用 `DESKTOP_API_BASE_URL` 覆盖地址、`DESKTOP_CONFIG_PATH` 选择配置文件。执行 `pnpm --filter @visionhub/desktop start` 前先构建 renderer，并确保 API 服务已启动。正式安装包仍需 P4.5 完成外置配置打包、签名、公证、DMG/ZIP 与 GitHub Release 发布。

## Docker Compose 部署

先把 `.env.example` 复制为根目录 `.env`，再按实际数据库连接方式修改 `DATABASE_URL` 与 `DATABASE_URL_DOCKER`。配置里的数据库地址必须能从相应运行环境访问；从 API 容器访问数据库时，`localhost` 指的是 API 容器自身，而不是宿主机。

### 默认方式：通过直连地址访问数据库

```powershell
docker compose --env-file .env -f infra/compose.yaml up --build -d
```

默认只启动 Web 与 API。Web 发布到 `WEB_PORT`（默认 8080），API 仅在 Compose 内部网络可访问。API 容器优先使用 `DATABASE_URL_DOCKER`，未设置时使用 `DATABASE_URL`。直连地址可以是 API 容器可访问的主机名或 IP，不要求存在独立的 Docker 数据网络。

### 方式 A：加入已有 PostgreSQL 容器所在的数据网络

在 `.env` 中设置实际的 `EXISTING_DB_NETWORK`，并将 `DATABASE_URL_DOCKER` 配置为该网络上可解析的数据库地址/别名：

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.existing-db-network.yaml up --build -d
```

此 overlay 只把 API 加入指定的外部网络；Web 仍只加入应用网络。如果数据库地址是可从应用容器直接访问的 IP/DNS，也可以不用这个 overlay。

### 方式 B：按需启动 Compose PostgreSQL 容器

默认不会创建或启动数据库容器。需要临时或独立运行 PostgreSQL 时，配置 `POSTGRES_PASSWORD`。加入数据库 overlay 后，API 会自动使用 Compose 服务地址 `postgres:5432` 和对应的 `POSTGRES_*` 账号、数据库配置，不会沿用为其他部署模式设置的 `DATABASE_URL_DOCKER`。宿主机执行迁移时，`DATABASE_URL` 应指向映射端口 `127.0.0.1:5433`。首次使用先启动数据库服务：

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up --build -d postgres
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools init
```

`db-tools init` 会在容器内创建 schema、执行迁移并写入 seed 数据。该工具服务使用 `tools` profile，普通 `compose up` 不会常驻启动它；`run --rm` 完成后即退出。确认初始化成功后再启动应用：

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up --build -d
```

数据库数据保存在名为 `postgres_data` 的 Docker volume 中。宿主机端口默认绑定到 `127.0.0.1:5433`，不对局域网或公网发布；API 与 db-tools 容器通过 Compose 网络内的 `postgres:5432` 访问。停止服务时使用同一组 `-f` 参数执行 `down`；不要删除该 volume，除非明确要销毁其中的数据。

### 日常容器管理命令

启动命令中的 Compose 文件路径已从仓库根目录调整到 `infra/compose.yaml`。平时管理默认（外部数据库直连）部署时，可直接使用：

```powershell
# 查看容器状态
docker compose --env-file .env -f infra/compose.yaml ps

# 查看 Web/API 日志
docker compose --env-file .env -f infra/compose.yaml logs -f --tail=200 web api

# 仅重启应用服务
docker compose --env-file .env -f infra/compose.yaml restart api web

# 停止 / 重新启动服务
docker compose --env-file .env -f infra/compose.yaml stop
docker compose --env-file .env -f infra/compose.yaml start

# 删除容器和 Compose 网络（不会删除命名数据卷）
docker compose --env-file .env -f infra/compose.yaml down
```

如果启动时使用了数据库 overlay，后续命令也必须带上同一个文件：managed 模式额外加 `-f infra/compose.database.yaml`；已有数据库网络模式额外加 `-f infra/compose.existing-db-network.yaml`。除非明确要删除数据库数据，否则不要添加 `down -v`。

### 数据库维护、备份与还原

数据库初始化、迁移和 seed 都可通过一次性工具容器运行，不必在宿主机安装 Prisma：

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools migrate
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools seed
```

逻辑备份只包含 `visionhub` schema，每份备份都可独立还原，支持现有网络/直连数据库：

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-backup
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-list
```

自建 PostgreSQL 18 容器还支持整个数据库集群的物理全量/增量备份。首次使用先执行 `physical-backup-full`，之后可定期执行 `physical-backup-incr`；增量恢复必须依赖其完整父链。先通过 `physical-restore-test latest` 在隔离的临时 PostgreSQL 实例中验证，再考虑正式还原。完整命令、安全要求、保留策略和 Windows 任务计划见 [部署与备份说明](docs/DEPLOYMENT.md)。

### 云端自动备份容器（可选）

可用 Compose 的 `backup` profile 运行常驻调度容器，默认每天 02:30 UTC 备份，失败后按 15 分钟间隔重试。普通应用启动不会启动该容器。

```powershell
# 外部 PostgreSQL：逻辑备份
docker compose --env-file .env --profile backup -f infra/compose.yaml up --build -d backup

# Compose 管理的 PostgreSQL 18：逻辑备份 + 物理全量/增量备份
docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml up --build -d backup

# 立即执行一次验证，并查看后续调度日志
docker compose --env-file .env --profile backup -f infra/compose.yaml run --rm backup --once
docker compose --env-file .env --profile backup -f infra/compose.yaml logs -f --tail=100 backup
```

云端建议把 `BACKUP_HOST_DIR` 指向持久磁盘，并配置 `BACKUP_REMOTE=cloud:bucket/visionhub` 与 S3 兼容存储凭据，将备份复制到异地对象存储。启用远程上传时必须同时配置 `BACKUP_AGE_RECIPIENTS`：在可信机器离线生成 age 密钥对，只将 `age1...` 公钥放到云端，私钥保留在离线恢复位置；否则上传会失败并拒绝传输明文。完整配置、解密恢复和迁移旧明文备份的注意事项见 [云端自动备份说明](docs/DEPLOYMENT.md#cloud-deployment-automated-backup-container)。


### 按需将 API 端口映射到宿主机

默认不发布 API 端口。如果调试工具需要直接访问 API，可以额外加入：

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.api-published.yaml up --build -d
```

该映射只绑定到宿主机 loopback 地址 `127.0.0.1`。API 端口 overlay 可与任一种数据库模式组合；本地 PostgreSQL overlay 与现有数据库网络 overlay 是互斥选择，不要同时启用。Compose 文件位于 `infra/`，但相对构建路径和配置挂载已按仓库根目录调整。

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
  desktop/   Electron 主进程、preload 与 Web renderer 开发壳
  api/       NestJS API、Prisma Client、数据库迁移与种子脚本
packages/
  config/    YAML/env 合并、Zod 校验与独立桌面配置加载
  contracts/ Web、Electron、API 共用的无依赖类型
  ui/        跨客户端 tokens、Tailwind 组件原语
configs/     开发、生产、桌面 YAML 配置
deploy/      Dockerfile 与 Nginx 配置
infra/       Compose 主文件及可选数据库、网络和 API 端口 overlays
```
