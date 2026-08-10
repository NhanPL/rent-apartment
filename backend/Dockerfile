# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22.18.0

FROM node:${NODE_VERSION}-alpine3.22 AS dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

FROM node:${NODE_VERSION}-alpine3.22 AS production-dependencies
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-alpine3.22 AS runtime
ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=4000
WORKDIR /app/backend
COPY --from=production-dependencies --chown=node:node /app/backend/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./dist
COPY --chown=node:node backend/package.json backend/package-lock.json ./
COPY --chown=node:node backend/scripts ./scripts
COPY --chown=node:node migrations /app/migrations
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
