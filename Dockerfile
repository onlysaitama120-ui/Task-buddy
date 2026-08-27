FROM node:18-bullseye-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Prisma client generation & TypeScript build
RUN npx prisma generate --schema=src/database/prisma/schema.prisma
RUN npm run build

EXPOSE 3000

# Start the bot (compiled JS in dist)
CMD ["node", "dist/index.js"]
