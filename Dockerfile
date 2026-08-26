FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tsconfig.json ./
RUN npm run build

COPY src/database/prisma ./src/database/prisma
RUN npx prisma generate --schema=src/database/prisma/schema.prisma

EXPOSE 3000

CMD ["node", "dist/index.js"]