# LiveKit Cloud agent worker for voice-genui-livekit
# Docs: https://docs.livekit.io/deploy/agents/
# syntax=docker/dockerfile:1

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# Required by @livekit/rtc-node: the native core reads the system CA trust store.
RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Prefetch plugin model files for faster cold starts (VAD / turn detection, etc.)
# Discovers @livekit/agents-plugin-* without loading agent code.
RUN npx livekit-agents download-files

COPY . .

FROM base

ARG UID=10001
RUN adduser \
  --disabled-password \
  --gecos "" \
  --home "/app" \
  --shell "/sbin/nologin" \
  --uid "${UID}" \
  appuser

WORKDIR /app

COPY --from=build --chown=appuser:appuser /app /app

USER appuser

ENV NODE_ENV=production

# Production worker mode — connects to LiveKit Cloud and waits for jobs.
# (package.json "start" is reserved for Next.js on Vercel.)
CMD ["npx", "tsx", "agent/main.ts", "start"]
