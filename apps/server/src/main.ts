import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';

const PORT = Number(process.env.SERVER_PORT ?? 4001);

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:3000' });
  // Native ws rather than socket.io so the console can use the browser's own
  // WebSocket, and so a future screencast socket gets a real flush callback.
  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen(PORT);
  console.log(`Understudy server listening on http://localhost:${PORT}`);
  console.log(`Run log stream on ws://localhost:${PORT}/ws`);
}

await bootstrap();
