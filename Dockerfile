# syntax=docker/dockerfile:1.7
FROM node:22-slim AS builder
WORKDIR /build
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsdown.config.ts ./
COPY src ./src
RUN pnpm run build
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
USER node
WORKDIR /work
ENTRYPOINT ["node", "/app/dist/index.mjs"]
