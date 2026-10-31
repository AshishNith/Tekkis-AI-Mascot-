# Tekkie server + web playground. Built and run on the VPS by deploy/install.sh.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY server/package.json server/
RUN npm ci --workspace apps/web --workspace server --include-workspace-root
COPY shared shared
COPY apps/web apps/web
COPY server server
RUN npm run build -w apps/web && npm run build -w server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force
COPY shared shared
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
