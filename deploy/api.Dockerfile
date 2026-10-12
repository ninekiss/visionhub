FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @visionhub/api...
COPY apps/api apps/api
COPY contracts contracts
COPY configs configs
RUN rm -rf apps/api/dist apps/api/tsconfig.tsbuildinfo apps/api/dist/tsconfig.tsbuildinfo \
    && pnpm --filter @visionhub/api build \
    && test -f apps/api/dist/main.js \
    && test -f apps/api/dist/app.module.js \
    && test -f apps/api/dist/catalog/catalog.module.js

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --prod --filter @visionhub/api...
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY configs configs
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]