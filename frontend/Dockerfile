FROM node:22.13.1-alpine3.21 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace @elon-meals-db/frontend

FROM node:22.13.1-alpine3.21 AS build
WORKDIR /app
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY package.json package-lock.json ./
COPY frontend ./frontend
WORKDIR /app/frontend
RUN npm run build

FROM nginx:1.27.3-alpine3.20 AS runtime
RUN addgroup -S -g 10001 elon && adduser -S -D -H -u 10001 -G elon elon
COPY frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
RUN chown -R elon:elon /usr/share/nginx/html /var/cache/nginx /var/run /tmp
USER elon
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
