FROM node:22-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_DB_PATH=/data/node-meta.sqlite

VOLUME ["/data"]
EXPOSE 3000 41234/udp

CMD ["npx", "tsx", "server.ts"]
