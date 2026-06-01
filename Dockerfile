# ── Base image ──────────────────────────────────────────────────────────
FROM node:20-slim

# ── Set working directory ────────────────────────────────────────────────
WORKDIR /app

# ── Install backend dependencies (production only) ───────────────────────
COPY package*.json ./
RUN npm ci --only=production

RUN apt-get update && apt-get install -y \
  chromium \
  fonts-freefont-ttf \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ── Copy all application source ──────────────────────────────────────────
COPY . .

# ── Build React dashboard (deps installed then pruned to keep image lean) ─
RUN cd ui && npm ci && npm run build && rm -rf node_modules

# ── Cloud Run requires the container to listen on $PORT (default 8080) ───
EXPOSE 8080

# ── Start the server ─────────────────────────────────────────────────────
CMD [ "npm", "start" ]
