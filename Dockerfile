# ── Base image ──────────────────────────────────────────────────────────
FROM node:18-slim

# ── Set working directory ────────────────────────────────────────────────
WORKDIR /app

# ── Install dependencies (production only) ───────────────────────────────
# Copy manifests first to leverage Docker layer caching
COPY package*.json ./
RUN npm ci --only=production

RUN apt-get update && apt-get install -y \
  chromium \
  fonts-freefont-ttf \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ── Copy application source ──────────────────────────────────────────────
COPY . .

# ── Cloud Run requires the container to listen on $PORT (default 8080) ───
EXPOSE 8080

# ── Start the server ─────────────────────────────────────────────────────
CMD [ "npm", "start" ]
