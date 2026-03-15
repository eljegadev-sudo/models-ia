# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.14.0
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="Next.js"

WORKDIR /app

ENV NODE_ENV="production"
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Build stage ----
FROM base as build

# Install native build tools for node modules with native code (sharp, bcrypt, etc.)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install all dependencies (including devDependencies for build)
COPY package-lock.json package.json ./
RUN npm ci --include=dev

# Copy source code
COPY --link . .

# Generate Prisma client (doesn't need DATABASE_URL)
RUN npx prisma generate

# Build Next.js standalone output
RUN npm run build

# ---- Final production stage ----
# Use full bookworm (not slim) to ensure all native libs (OpenSSL, glibc, etc.) are present
FROM node:${NODE_VERSION}-bookworm

# Copy standalone output (Next.js + minimal traced node_modules)
COPY --from=build /app/.next/standalone /app
COPY --from=build /app/.next/static /app/.next/static
COPY --from=build /app/public /app/public

# Copy Prisma schema (needed for migration commands)
COPY --from=build /app/prisma /app/prisma

# Copy Prisma query engine binaries (NOT included in Next.js standalone trace)
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client /app/node_modules/@prisma/client

WORKDIR /app

EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000
ENV NODE_ENV="production"
ENV NEXT_TELEMETRY_DISABLED=1
# Prevent unhandled rejections from crashing the process silently
ENV NODE_OPTIONS="--unhandled-rejections=warn"

CMD [ "node", "server.js" ]
