# Production image of the AQARAT portal (lab server and OpenShift; replaces `ng serve`).
# Stage 1 builds the Angular app; stage 2 serves it with unprivileged nginx over HTTPS on 4200. The image runs as any
# non-root user ID (OpenShift's restricted policy). URLs come from settings.ts or, at runtime, from /config.json.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx ng build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/portal/browser /usr/share/nginx/html
# TLS certificate and key are mounted at runtime (docker-compose.server.yml / an OpenShift Secret); never baked in.
EXPOSE 4200
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q --spider --no-check-certificate https://127.0.0.1:4200/ || exit 1
