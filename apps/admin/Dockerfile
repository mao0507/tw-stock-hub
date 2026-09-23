# build context：repo 根目錄
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @tw-stock-hub/admin...  && pnpm --filter @tw-stock-hub/admin build

FROM nginx:1.27-alpine
COPY --from=builder /repo/apps/admin/dist /usr/share/nginx/html
COPY .docker/nginx/admin.conf.template /etc/nginx/templates/default.conf.template
