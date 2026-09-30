import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db, MongoClient } from 'mongodb';

const OTP_LENGTH = 6;
const OTP_LIFETIME_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type BuildAppOptions = {
  mongo: MongoClient;
  databaseName: string;
};

type ChallengeRequest = {
  tenantId: string;
  productCode: string;
  channel: 'EMAIL';
  flowType: string;
  recipient: string;
  idempotencyKey: string;
};

type Delivery = {
  challengeId: string;
  channel: 'EMAIL';
  recipient: string;
  code: string;
  sentAt: string;
};

const hashCode = (code: string): string => createHmac(
  'sha256',
  process.env.OTP_HASH_SECRET ?? 'rec-otp-pov-development-secret',
).update(code).digest('hex');

const codesMatch = (code: string, expectedHash: string): boolean => {
  const actual = Buffer.from(hashCode(code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const newCode = (): string => randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, '0');

const requiredFieldsPresent = (body: Partial<ChallengeRequest>): body is ChallengeRequest => (
  typeof body.tenantId === 'string'
  && typeof body.productCode === 'string'
  && body.channel === 'EMAIL'
  && typeof body.flowType === 'string'
  && typeof body.recipient === 'string'
  && typeof body.idempotencyKey === 'string'
);

export async function buildApp({ mongo, databaseName }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const db: Db = mongo.db(databaseName);
  const challenges = db.collection('otp_challenges');
  const auditEvents = db.collection('audit_events');
  const deliveries: Delivery[] = [];

  await challenges.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'otp_expiry_ttl' });
  await challenges.createIndex({ idempotencyKey: 1, status: 1 }, { name: 'otp_idempotency_status' });
  await auditEvents.createIndex({ challengeId: 1, createdAt: 1 }, { name: 'audit_challenge_created' });

  app.post('/v1/otp/challenges', async (request, reply) => {
    const body = request.body as Partial<ChallengeRequest>;
    if (!requiredFieldsPresent(body)) {
      return reply.code(400).send({ error: 'Invalid challenge request' });
    }

    const existing = await challenges.findOne({
      idempotencyKey: body.idempotencyKey,
      status: 'ACTIVE',
      expiresAt: { $gt: new Date() },
    });
    if (existing) {
      return reply.code(200).send({
        challengeId: existing.challengeId,
        expiresAt: existing.expiresAt.toISOString(),
        delivery: { channel: existing.channel, recipient: existing.recipient },
      });
    }

    const challengeId = randomUUID();
    const code = newCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_LIFETIME_MS);
    await challenges.insertOne({
      challengeId,
      ...body,
      otpCodeHash: hashCode(code),
      status: 'ACTIVE',
      attemptCount: 0,
      maxAttempts: MAX_ATTEMPTS,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
    await auditEvents.insertOne({
      eventType: 'OTP_CREATED',
      challengeId,
      tenantId: body.tenantId,
      productCode: body.productCode,
      createdAt: now,
    });

    deliveries.push({
      challengeId,
      channel: body.channel,
      recipient: body.recipient,
      code,
      sentAt: now.toISOString(),
    });

    return reply.code(201).send({
      challengeId,
      expiresAt: expiresAt.toISOString(),
      delivery: { channel: body.channel, recipient: body.recipient },
    });
  });

  app.post('/v1/otp/challenges/:challengeId/verify', async (request, reply) => {
    const { challengeId } = request.params as { challengeId: string };
    const { code } = request.body as { code?: string };
    const challenge = await challenges.findOne({ challengeId });

    if (!challenge) {
      return reply.code(404).send({ error: 'Challenge not found' });
    }
    if (challenge.status === 'LOCKED' || challenge.attemptCount >= MAX_ATTEMPTS) {
      return reply.code(423).send({ error: 'Challenge locked' });
    }
    if (challenge.expiresAt <= new Date()) {
      await challenges.deleteOne({ challengeId });
      return reply.code(410).send({ error: 'Challenge expired' });
    }

    if (typeof code !== 'string' || !codesMatch(code, challenge.otpCodeHash)) {
      const attemptCount = challenge.attemptCount + 1;
      const status = attemptCount >= MAX_ATTEMPTS ? 'LOCKED' : 'ACTIVE';
      await challenges.updateOne(
        { challengeId, status: 'ACTIVE' },
        { $set: { attemptCount, status, updatedAt: new Date() } },
      );
      await auditEvents.insertOne({
        eventType: 'OTP_VERIFICATION_FAILED',
        challengeId,
        tenantId: challenge.tenantId,
        productCode: challenge.productCode,
        createdAt: new Date(),
      });
      return reply.code(401).send({ error: 'Invalid code' });
    }

    await auditEvents.insertOne({
      eventType: 'OTP_VERIFIED',
      challengeId,
      tenantId: challenge.tenantId,
      productCode: challenge.productCode,
      createdAt: new Date(),
    });
    await challenges.deleteOne({ challengeId, status: 'ACTIVE' });
    return reply.code(200).send({ verified: true });
  });

  app.get('/demo/deliveries', async () => deliveries);
  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}
