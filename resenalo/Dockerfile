# Imagen de producción de Reseñalo (web y worker comparten imagen)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 1001 resenalo
COPY --from=build --chown=resenalo /app ./
USER resenalo
EXPOSE 3000
# web:    npx prisma migrate deploy && npx tsx prisma/seed.ts && npm start
# worker: npm run worker
CMD ["npm", "start"]
