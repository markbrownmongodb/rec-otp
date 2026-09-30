import type { MongoClient } from 'mongodb';
import { buildApp } from './app.js';

type ServerOptions = {
  mongo: MongoClient;
  databaseName: string;
  host?: string;
  port?: number;
};

export async function createServer({ mongo, databaseName, host = '127.0.0.1', port = 0 }: ServerOptions) {
  const app = await buildApp({ mongo, databaseName });
  let address: string | undefined;

  return {
    app,
    async start(): Promise<string> {
      address = await app.listen({ host, port });
      return address;
    },
    async stop(): Promise<void> {
      await app.close();
    },
    get address(): string | undefined {
      return address;
    },
  };
}
