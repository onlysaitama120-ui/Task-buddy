FROM node:18-alpine

# Install OpenSSL 1.1 compatibility for Prisma
RUN apk add --no-cache openssl1.1-compat

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY src ./src
COPY tsconfig.json ./

RUN npx prisma generate --schema=src/database/prisma/schema.prisma
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]