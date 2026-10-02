# Multi-stage Docker build for Telegram Security Bot
# Base: Node.js 22 Alpine for minimal footprint and security

FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache openssl python3 make g++

# Copy package manifests and Prisma schema first for optimal caching
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source code and build configs
COPY tsconfig.json ./
COPY src ./src/

# Compile TypeScript
RUN npm run build

# Production runner stage
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl curl

ENV NODE_ENV=production

# Copy built artifacts and production dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

# Copy generated Prisma engine & client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist

# Create dedicated temp scan directory with permissions for node user
RUN mkdir -p /tmp/tg-bot-security-scans && chown -R node:node /tmp/tg-bot-security-scans /app

USER node

EXPOSE 3000

# Docker healthcheck querying /health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
