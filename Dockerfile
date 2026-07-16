FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST_BIND=0.0.0.0 PORT=3001 WEB_DIST=/app/apps/web/dist DATA_DIR=/data
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/game-server/dist ./apps/game-server/dist
COPY --from=build /app/apps/game-server/package.json ./apps/game-server/package.json
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "apps/game-server/dist/index.js"]
