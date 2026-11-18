FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Valores do Docker local; no Railway, as variáveis do serviço os substituem.
ENV PORT=8080 \
    API_UPSTREAM=http://api:3000 \
    NGINX_RESOLVER="127.0.0.11 ipv6=off"
# Em /etc/nginx/templates, a imagem gera o conf.d/default.conf trocando as variáveis acima ao iniciar.
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
COPY nginx/seguranca.conf /etc/nginx/snippets/seguranca.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
