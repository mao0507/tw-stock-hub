# build context：repo 根目錄
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @tw-stock-hub/web...  && pnpm --filter @tw-stock-hub/web build

FROM nginx:1.27-alpine
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
COPY .docker/nginx/web.conf /etc/nginx/conf.d/default.conf
