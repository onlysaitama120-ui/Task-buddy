FROM node:18-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY src ./src
COPY tsconfig.json ./

RUN npx prisma generate --schema=src/database/prisma/schema.prisma
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --schema=src/database/prisma/schema.prisma --accept-data-loss && node dist/index.js"]