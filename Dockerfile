FROM node:22-alpine AS deps

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY tsconfig.json tsup.config.ts ./
COPY src ./src

RUN pnpm exec tsc --noEmit
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=build --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

USER nodejs

EXPOSE 3333

CMD ["node", "dist/server.mjs"]
