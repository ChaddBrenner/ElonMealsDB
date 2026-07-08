import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { config } from './config.js';
import { pingDatabase } from './db.js';
import { ApiError, asyncHandler, badRequest, bodyParserError, notFound } from './errors.js';
import {
  getCoverageMetrics,
  getRestaurantMenu,
  getStationMetrics,
  listFoods,
  listImportRuns,
  listRestaurants,
  listServiceDates
} from './repositories/menuRepository.js';
import {
  dateSchema,
  foodFilterSchema,
  idSchema,
  importRunLimitSchema,
  parseOrThrow
} from './validation.js';
import { sqlProof } from './sqlProof.js';

const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info'
});

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' }
  }));

  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(badRequest('Origin is not allowed'));
    },
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600
  }));

  app.use(rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many menu requests. Give the app a moment, then try again.'
        }
      });
    }
  }));

  app.use(express.json({
    limit: config.BODY_LIMIT,
    type: ['application/json']
  }));

  app.use(pinoHttp({ logger }));

  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'local-first' });
  });

  router.get('/ready', asyncHandler(async (_req, res) => {
    const database = await pingDatabase();
    res.status(database ? 200 : 503).json({ status: database ? 'ready' : 'not_ready', database });
  }));

  router.get('/restaurants', asyncHandler(async (req, res) => {
    const date = req.query.date ? parseOrThrow(dateSchema, req.query.date) : undefined;
    res.json({ restaurants: await listRestaurants(date) });
  }));

  router.get('/service-dates', asyncHandler(async (_req, res) => {
    res.json({ dates: await listServiceDates() });
  }));

  router.get('/import-runs', asyncHandler(async (req, res) => {
    const limit = parseOrThrow(importRunLimitSchema, req.query.limit ?? undefined);
    res.json({ runs: await listImportRuns(limit) });
  }));

  router.get('/restaurants/:id/menu', asyncHandler(async (req, res) => {
    const restaurantId = parseOrThrow(idSchema, req.params.id);
    res.json(await getRestaurantMenu(restaurantId));
  }));

  router.get('/foods', asyncHandler(async (req, res) => {
    const filters = parseOrThrow(foodFilterSchema, req.query);
    res.json({ foods: await listFoods(filters) });
  }));

  router.get('/metrics/coverage', asyncHandler(async (req, res) => {
    const date = req.query.date ? parseOrThrow(dateSchema, req.query.date) : undefined;
    res.json(await getCoverageMetrics(date));
  }));

  router.get('/metrics/stations', asyncHandler(async (req, res) => {
    const date = req.query.date ? parseOrThrow(dateSchema, req.query.date) : undefined;
    res.json(await getStationMetrics(date));
  }));

  router.get('/sql-proof', (_req, res) => {
    res.json({ examples: sqlProof });
  });

  app.use('/api', router);

  app.use((_req, _res, next) => next(notFound()));

  app.use((error, req, res, _next) => {
    const parserError = bodyParserError(error);
    const apiError = parserError || (error instanceof ApiError
      ? error
      : new ApiError(500, 'internal_error', 'An internal server error occurred'));

    if (!(error instanceof ApiError) && !parserError) {
      const activeLogger = req.log || logger;
      activeLogger.error({ err: error }, 'Unhandled API error');
    }

    res.status(apiError.status).json({
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details
      }
    });
  });

  return app;
}
