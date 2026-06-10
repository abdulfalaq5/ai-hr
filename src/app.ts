import express from 'express';
import { env } from './config/env';
import askRouter from './routes/ask.route';
import importRouter from './routes/import.route';
import { documentSearchService } from './services/document-search.service';

const app = express();

app.use(express.json());

// Routes
app.use('/ask', askRouter);
app.use('/import', importRouter);

// Health Endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'ai-hr',
  });
});

async function bootstrap() {
  try {
    // Init FTS config detection
    await documentSearchService.init();

    app.listen(env.PORT, () => {
      console.log(`[AI-HR] Service listening on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('[AI-HR] Failed to start service:', error);
    process.exit(1);
  }
}

bootstrap();

export default app;
