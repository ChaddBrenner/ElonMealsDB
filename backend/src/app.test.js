import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp();

describe('security and validation middleware', () => {
  it('returns health without exposing Express internals', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects malformed restaurant ids before query execution', async () => {
    const response = await request(app).get('/api/restaurants/1%20OR%201=1/menu');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('rejects unsafe search text', async () => {
    const response = await request(app).get('/api/foods?q=<script>alert(1)</script>');
    expect(response.status).toBe(400);
  });

  it('rejects impossible calendar dates', async () => {
    const response = await request(app).get('/api/restaurants?date=2026-02-31');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('rejects unsupported allergen filters', async () => {
    const response = await request(app).get('/api/foods?allergenFree=milk,unknown');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('bad_request');
  });

  it('rejects unsupported CORS origins with a structured error', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', 'https://attacker.example');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'bad_request',
      message: 'Origin is not allowed'
    });
  });

  it('normalizes malformed JSON bodies instead of returning an internal error', async () => {
    const response = await request(app)
      .post('/api/foods')
      .set('Content-Type', 'application/json')
      .send('{"not valid"');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'bad_request',
      message: 'Malformed JSON body'
    });
  });

  it('rejects oversized JSON bodies with a structured payload error', async () => {
    const response = await request(app)
      .post('/api/foods')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ payload: 'x'.repeat(9000) }));

    expect(response.status).toBe(413);
    expect(response.body.error).toEqual({
      code: 'payload_too_large',
      message: 'Request body is too large'
    });
  });

  it('does not expose server-side planner mutation routes', async () => {
    const response = await request(app)
      .post('/api/planner/meals')
      .send({ foodId: 1, quantity: 1 });
    expect(response.status).toBe(404);
  });

  it('rejects oversized numeric food filters', async () => {
    const response = await request(app).get('/api/foods?minProtein=999999');
    expect(response.status).toBe(400);
  });

  it('rejects unknown routes with structured JSON', async () => {
    const response = await request(app).get('/api/not-real');
    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'not_found',
      message: 'Resource not found'
    });
  });
});
