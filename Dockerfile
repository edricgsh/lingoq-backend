# syntax=docker/dockerfile:1

# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.env.* ./
EXPOSE 5007
CMD ["node", "dist/main"]
