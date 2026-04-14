# ═══════════════════════════════════════════════════════════════
# Dockerfile — Full Stack (Frontend + Backend)
# ═══════════════════════════════════════════════════════════════
# Multi-stage build:
#   Stage 1: Build React frontend with Vite
#   Stage 2: Python backend serves frontend + API
#
# This works on: Local, Railway, VPS
# Build:   docker build -t downloader .
# Run:     docker run -p 3001:3001 downloader
# ═══════════════════════════════════════════════════════════════

# ─── Stage 1: Build Frontend ───
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copy frontend files and configuration
COPY package.json package-lock.json* yarn.lock* tsconfig.json vite.config.ts tailwind.config.js* ./
COPY src/ ./src/
COPY index.html ./

# Install dependencies and build
RUN npm install || yarn install
# Use environment variable if provided, otherwise default to relative path
ARG VITE_API_URL=/
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ─── Stage 2: Python Backend + Serve Frontend ───
FROM python:3.11-slim

# ─── System Dependencies ───
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# ─── Python Dependencies ───
COPY server-python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY server-python/ .

# ─── Copy Frontend Build ───
COPY --from=frontend-builder /build/dist ./static

# ─── Create Application Directories ───
RUN mkdir -p /app/downloads

# ─── Environment Configuration ───
ENV APP_ENV=production
ENV APP_VERSION=1.0.0
ENV PYTHONUNBUFFERED=1

# ─── Health Check ───
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3001}/api/health || exit 1

# ─── Expose Port ───
EXPOSE 3001

# ─── Entry Point ───
CMD ["sh", "-c", "gunicorn -w 4 -b 0.0.0.0:${PORT:-3001} app:app --timeout 300 --access-logfile -"]
