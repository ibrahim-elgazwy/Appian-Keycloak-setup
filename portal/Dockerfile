# Production image of the AQARAT portal for the lab server (replaces `ng serve`).
# Stage 1 builds the Angular app; stage 2 serves it with nginx over HTTPS on 4200, the same origin as on the laptop,
# so the Keycloak redirect URI (https://portal.aqarat.lab:4200/callback) and the CORS origins stay unchanged.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/portal/browser /usr/share/nginx/html
# TLS certificate and key are mounted at runtime (see docker-compose.server.yml); they are never baked into the image.
EXPOSE 4200
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider --no-check-certificate https://127.0.0.1:4200/ || exit 1
