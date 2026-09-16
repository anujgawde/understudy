import express from 'express';

const PORT = Number(process.env.TARGET_APP_PORT ?? 4000);

const app = express();

app.use(express.urlencoded({ extended: false }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'target-app' });
});

app.get('/', (_req, res) => {
  res.type('html').send('<!doctype html><title>Target App</title><p>Target App is running.');
});

app.listen(PORT, () => {
  console.log(`Target App listening on http://localhost:${PORT}`);
});
