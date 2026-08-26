FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY src/database/prisma ./src/database/prisma

RUN npx prisma generate --schema=src/database/prisma/schema.prisma

EXPOSE 3000

CMD ["node", "dist/index.js"]