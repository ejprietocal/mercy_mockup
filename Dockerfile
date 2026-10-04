# Mercy Studio — imagen estática (nginx) que escucha en el puerto 4000
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Sitio: solo lo necesario para producción
COPY index.html catalogo.html producto.html checkout.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY assets/ /usr/share/nginx/html/assets/

# Marca de versión: http://SERVIDOR:4000/version.txt devuelve el commit desplegado
ARG GIT_SHA=dev
RUN echo "$GIT_SHA" > /usr/share/nginx/html/version.txt
LABEL org.opencontainers.image.revision="$GIT_SHA"

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/ >/dev/null || exit 1
