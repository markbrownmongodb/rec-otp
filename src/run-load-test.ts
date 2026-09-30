import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createServer } from './server.js';
import { trafficProfiles, runLoadTest } from './load-test.js';

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri || mongoUri === 'mongodb+srv://replace-me') {
  throw new Error('MONGODB_URI must be set before running the load test.');
}

const mongo = new MongoClient(mongoUri);
const databaseName = `${process.env.MONGODB_DATABASE ?? 'rec_otp_pov_load'}_load`;
await mongo.connect();
await mongo.db(databaseName).dropDatabase();
const server = await createServer({ mongo, databaseName });
const baseUrl = await server.start();

try {
  const profileName = process.env.LOAD_PROFILE ?? 'balanced';
  const profile = trafficProfiles[profileName];
  if (!profile) throw new Error(`Unknown LOAD_PROFILE: ${profileName}`);
  const result = await runLoadTest({
    baseUrl,
    iterations: Number(process.env.LOAD_ITERATIONS ?? 100),
    concurrency: Number(process.env.LOAD_CONCURRENCY ?? 10),
    tenantId: process.env.LOAD_TENANT_ID ?? 'tenant_load_test',
    profile,
    durationMs: process.env.LOAD_DURATION_MS ? Number(process.env.LOAD_DURATION_MS) : undefined,
    targetThroughput: process.env.LOAD_TARGET_THROUGHPUT ? Number(process.env.LOAD_TARGET_THROUGHPUT) : undefined,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await server.stop();
  await mongo.close();
}
