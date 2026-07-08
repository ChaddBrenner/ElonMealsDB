import 'dotenv/config';
import { z } from 'zod';

const envBoolean = (defaultValue) => z.string()
  .optional()
  .default(defaultValue ? 'true' : 'false')
  .transform((value, ctx) => {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expected a boolean-like value'
    });
    return defaultValue;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1).default('elon_meals'),
  DB_USER: z.string().min(1).default('elon_api'),
  DB_PASSWORD: z.string().default(''),
  CORS_ORIGINS: z.string().default('http://localhost:8080,http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(5000).default(360),
  BODY_LIMIT: z.string().regex(/^\d+(b|kb|mb)$/i).default('8kb'),
  SEMANTIC_SEARCH_ENABLED: envBoolean(true),
  EMBEDDING_SERVICE_URL: z.string().trim().default(''),
  EMBEDDING_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(10000).default(1500),
  FASTEMBED_MODEL: z.string().trim().min(1).default('BAAI/bge-small-en-v1.5')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid backend environment', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
};
