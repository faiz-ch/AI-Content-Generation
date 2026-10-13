# ---------- 1. Build the React app ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- 2. Serve it with nginx (+ built-in relay) ----------
FROM nginx:stable-alpine
# DNS servers used by the relay to reach the AI/search APIs. Override if your network blocks these.
ENV NGINX_RESOLVER="1.1.1.1 8.8.8.8"
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/relay-health || exit 1
