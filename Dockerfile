FROM node:24.17-trixie-slim AS backend-build
WORKDIR /opt/app

COPY backend/package*.json ./
COPY backend/tsconfig.json ./
COPY backend/tsconfig.build.json ./

RUN npm ci

COPY backend/ .

RUN npm run build

RUN npm cache clean --force 

RUN npm prune --omit=dev

FROM node:24.17-trixie-slim
WORKDIR /opt/app

LABEL org.opencontainers.image.title="Remnawave Subscription Page"
LABEL org.opencontainers.image.description="Remnawave Subscription Page"
LABEL org.opencontainers.image.url="https://github.com/remnawave/subscription-page"
LABEL org.opencontainers.image.source="https://github.com/remnawave/subscription-page"
LABEL org.opencontainers.image.vendor="Remnawave"
LABEL org.opencontainers.image.licenses="AGPL-3.0"
LABEL org.opencontainers.image.documentation="https://docs.rw"


RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node --from=backend-build /opt/app/dist ./dist
COPY --chown=node:node --from=backend-build /opt/app/node_modules ./node_modules

COPY --chown=node:node frontend/dist/ ./frontend/

COPY --chown=node:node backend/package*.json ./


COPY --chown=node:node backend/ecosystem.config.js ./
COPY --chown=node:node backend/docker-entrypoint.sh ./

# Keep shell entrypoints portable when the build context comes from Windows.
RUN sed -i 's/\r$//' docker-entrypoint.sh \
    && sh -n docker-entrypoint.sh

ENV PM2_DISABLE_VERSION_CHECK=true
ENV PM2_HOME=/tmp/pm2
ENV NODE_OPTIONS="--max-old-space-size=16384"

RUN npm install --global pm2@7.0.3 \
    && npm cache clean --force

USER node

ENTRYPOINT [ "/bin/sh", "docker-entrypoint.sh" ]

CMD [ "pm2-runtime", "start", "ecosystem.config.js", "--env", "production" ]
