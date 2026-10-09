# B's Gua Sha — zero-dependency Node server
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=3000 BG_DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server.js"]
