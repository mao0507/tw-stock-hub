# build context：repo 根目錄
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @tw-stock-hub/api
COPY apps/api apps/api
RUN pnpm --filter @tw-stock-hub/api build \
 && pnpm --filter @tw-stock-hub/api deploy --prod --legacy /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/node_modules node_modules
COPY --from=build /out/package.json .
COPY --from=build /repo/apps/api/dist dist
COPY --from=build /repo/apps/api/drizzle drizzle
USER node
EXPOSE 3001
CMD ["node", "--max-old-space-size=128", "dist/index.js"]
