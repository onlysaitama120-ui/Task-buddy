import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const client = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

client.$use(async (params, next) => {
  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await next(params);
    } catch (error: any) {
      const msg = error.message || '';
      const isConnErr = msg.includes('database server') || msg.includes('ECONNREFUSED') || error.code === 'P1001';
      
      if (isConnErr && attempt < maxRetries) {
        console.warn('[DB Retry ' + attempt + '/' + maxRetries + '] DB sleeping, retrying in ' + (retryDelay/1000) + 's...');
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      throw error;
    }
  }
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = client;
}

export const prisma = client;
export default client;
