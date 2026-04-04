# Stage 1 — Build
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2 — Runtime
FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5100

EXPOSE 5100

USER node

CMD ["node", "dist/index.cjs"]
