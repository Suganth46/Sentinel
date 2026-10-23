# ── Stage 1: Install production dependencies ──────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Final image ───────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Non-root user for security
USER node

EXPOSE 3000

# Use dumb-init to handle PID 1 signals correctly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
