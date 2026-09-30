import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { createServer } from '../src/server.js';

const mongoUri = process.env.MONGODB_URI;
const databaseName = `${process.env.MONGODB_DATABASE ?? 'rec_otp_pov_test'}_server`;

describe('RecOTP server', () => {
  let mongo: MongoClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let address: string;

  beforeAll(async () => {
    if (!mongoUri || mongoUri === 'mongodb+srv://replace-me') {
      throw new Error('Set MONGODB_URI in .env to a MongoDB Atlas connection string.');
    }

    mongo = new MongoClient(mongoUri);
    await mongo.connect();
    server = await createServer({ mongo, databaseName });
    address = await server.start();
  });

  afterAll(async () => {
    await server?.stop();
    await mongo?.db(databaseName).dropDatabase();
    await mongo?.close();
  });

  it('starts on an available port and exposes a health endpoint', async () => {
    const response = await fetch(`${address}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
