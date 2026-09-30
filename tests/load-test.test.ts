import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll } from 'vitest';
import { createServer } from '../src/server.js';
import { runLoadTest } from '../src/load-test.js';

describe('RecOTP load test', () => {
  const mongoUri = process.env.MONGODB_URI;
  const databaseName = `${process.env.MONGODB_DATABASE ?? 'rec_otp_pov_test'}_load_${randomUUID()}`;
  let mongo: MongoClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    if (!mongoUri || mongoUri === 'mongodb+srv://replace-me') {
      throw new Error('Set MONGODB_URI in .env to a MongoDB Atlas connection string.');
    }
    mongo = new MongoClient(mongoUri);
    await mongo.connect();
    server = await createServer({ mongo, databaseName });
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server?.stop();
    await mongo?.db(databaseName).dropDatabase();
    await mongo?.close();
  });

  it('reports write-to-read latency and acceptance results', async () => {
    const result = await runLoadTest({
      baseUrl,
      iterations: 2,
      concurrency: 1,
      tenantId: 'tenant_load_test',
    });

    expect(result).toEqual(expect.objectContaining({
      iterations: 2,
      successfulVerifications: 2,
      failedOperations: 0,
      latencyMs: expect.objectContaining({
        p50: expect.any(Number),
        p95: expect.any(Number),
        max: expect.any(Number),
      }),
      meetsTenSecondMaximum: true,
    }));
    expect(result.latencyMs.p95).toBeLessThanOrEqual(10_000);
  });
});
