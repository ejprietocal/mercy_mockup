# Mercy Studio — tienda + panel administrador (servidor Node sin dependencias) en el puerto 4000
# Los datos (contenido, usuarios, cupones, fotos subidas…) viven en /data: MONTA UN VOLUMEN AHÍ
# (en Easypanel: Mounts → Volume → /data). Sin volumen, cada despliegue empieza de cero.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    TRUST_PROXY=1

# Carpeta de datos con dueño "node" (uid 1000): un volumen nuevo hereda estos permisos
RUN mkdir -p /data && chown node:node /data

# Código: tienda, panel y servidor (server/test y demás quedan fuera por .dockerignore)
COPY package.json ./
COPY index.html catalogo.html producto.html checkout.html ./
COPY css/ ./css/
COPY js/ ./js/
COPY assets/ ./assets/
COPY admin/ ./admin/
COPY server/ ./server/

# Marca de versión: /version.txt y /api/health devuelven el commit desplegado
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.revision="$GIT_SHA"

VOLUME /data
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1

CMD ["node", "server/index.js"]
