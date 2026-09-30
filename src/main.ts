import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createServer } from './server.js';

const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DATABASE ?? 'rec_otp_pov';
const port = Number(process.env.PORT ?? 3000);

if (!mongoUri || mongoUri === 'mongodb+srv://replace-me') {
  throw new Error('MONGODB_URI must be set before starting RecOTP.');
}

const mongo = new MongoClient(mongoUri);
await mongo.connect();
const server = await createServer({ mongo, databaseName, port });
await server.start();

const shutdown = async () => {
  await server.stop();
  await mongo.close();
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

console.log(`RecOTP listening on ${server.address}`);
