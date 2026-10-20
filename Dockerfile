# @group Configuration > Base : Build and run with the supported Node.js runtime
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* npm-shrinkwrap.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# @group Configuration > Release : Identify published images without including repository state
ARG APP_VERSION=1.1.0
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="EZ Kafka Visualizer" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/thechandanbhagat/ezkafka-visualizer" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
# ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/LICENSE ./LICENSE

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next
RUN mkdir data && chown nextjs:nodejs data && chmod 700 data

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts/access-config.cjs /app/scripts/start-standalone.cjs ./scripts/

USER nextjs

# Make port configurable via environment variable
ARG PORT=3700
ENV PORT=${PORT}
ENV HOSTNAME="0.0.0.0"
ENV EZKAFKA_CONFIG_PATH="/app/data/settings.json"

# Kafka configuration environment variables
ENV KAFKA_BROKERS="localhost:9092"
ENV KAFKA_CLIENT_ID="ezkafka-visualizer"
ENV KAFKA_CONNECTION_TIMEOUT=3000
ENV KAFKA_REQUEST_TIMEOUT=30000

EXPOSE ${PORT}

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "scripts/start-standalone.cjs"]
