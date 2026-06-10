import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.string().default('9004'),
  NODE_ENV: z.string().default('production'),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.string().default('5432'),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('[AI-HR] Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
