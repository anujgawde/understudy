import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const PORT = Number(process.env.SERVER_PORT ?? 4001);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3000' });
  await app.listen(PORT);
  console.log(`Understudy server listening on http://localhost:${PORT}`);
}

await bootstrap();
