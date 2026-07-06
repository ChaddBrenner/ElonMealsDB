FROM node:22.13.1-alpine3.21 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace @elon-meals-db/backend

FROM node:22.13.1-alpine3.21 AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
RUN addgroup -S -g 10001 elon && adduser -S -D -H -u 10001 -G elon elon
COPY --from=deps /app/node_modules /app/node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/scripts ./scripts
USER elon
EXPOSE 9000
CMD ["node", "src/server.js"]
