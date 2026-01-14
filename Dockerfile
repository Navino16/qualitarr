# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Production stage
FROM node:22-alpine

LABEL org.opencontainers.image.title="Qualitarr"
LABEL org.opencontainers.image.description="Monitor and compare expected vs actual quality scores for Radarr/Sonarr downloads"
LABEL org.opencontainers.image.source="https://github.com/njaunet/qualitarr"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.authors="njaunet"

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

ENTRYPOINT ["node", "dist/cli.js"]