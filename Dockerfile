FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/backend/index.js"]

