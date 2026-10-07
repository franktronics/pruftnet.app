# Build context: repository root. docker build -f apps/site/Dockerfile .
ARG NODE_VERSION=24.14.0

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /repo
RUN npm install --global pnpm@11.7.0
# Manifests first so dependency installation is cached independently of source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/site/package.json apps/site/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/
RUN pnpm install --frozen-lockfile --filter @repo/site...
COPY apps/site apps/site
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY packages/utils packages/utils
RUN pnpm --filter @repo/site build

# The server entry bundles its dependencies, so the runtime image only needs dist/.
FROM node:${NODE_VERSION}-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/site/dist ./
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD wget -q --spider http://127.0.0.1:4321/ || exit 1
CMD ["node", "server/entry.mjs"]
