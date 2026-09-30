import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient } from 'mongodb';
import { buildApp } from '../src/app.js';

const databaseName = `${process.env.MONGODB_DATABASE ?? 'rec_otp_pov_test'}_${randomUUID()}`;
const mongoUri = process.env.MONGODB_URI;

describe('RecOTP API', () => {
  const tenantId = 'tenant_demo';
  const request = {
    tenantId,
    productCode: 'UKG_PRO',
    channel: 'EMAIL',
    flowType: 'LOGIN',
    recipient: 'jane.doe@example.com',
    idempotencyKey: `${tenantId}:UKG_PRO:EMAIL:LOGIN:jane.doe@example.com`,
  };

  let app: Awaited<ReturnType<typeof buildApp>>;
  let mongo: MongoClient;

  beforeAll(async () => {
    if (!mongoUri || mongoUri === 'mongodb+srv://replace-me') {
      throw new Error('Set MONGODB_URI in .env to a MongoDB Atlas connection string.');
    }

    mongo = new MongoClient(mongoUri);
    await mongo.connect();
    app = await buildApp({ mongo, databaseName });
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.db(databaseName).dropDatabase();
    await mongo?.close();
  });

  it('creates a challenge, persists an audit event, and sends a demo email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/otp/challenges',
      payload: request,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      challengeId: expect.any(String),
      expiresAt: expect.any(String),
      delivery: { channel: 'EMAIL', recipient: request.recipient },
    });

    const challenge = await mongo.db(databaseName).collection('otp_challenges').findOne({
      challengeId: response.json().challengeId,
    });
    expect(challenge).toEqual(expect.objectContaining({
      tenantId,
      status: 'ACTIVE',
      attemptCount: 0,
    }));
    expect(challenge?.otpCodeHash).toEqual(expect.any(String));
    expect(challenge?.otpCode).toBeUndefined();

    const audit = await mongo.db(databaseName).collection('audit_events').findOne({
      eventType: 'OTP_CREATED',
      challengeId: response.json().challengeId,
    });
    expect(audit).toEqual(expect.objectContaining({ tenantId, productCode: 'UKG_PRO' }));

    const delivery = await app.inject({ method: 'GET', url: '/demo/deliveries' });
    expect(delivery.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipient: request.recipient, channel: 'EMAIL' }),
    ]));
  });

  it('supports read-after-write verification using the code in the demo delivery', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/otp/challenges',
      payload: { ...request, idempotencyKey: randomUUID() },
    });
    const challengeId = created.json().challengeId;
    const deliveries = await app.inject({ method: 'GET', url: '/demo/deliveries' });
    const delivery = deliveries.json().find((item: { challengeId: string }) => item.challengeId === challengeId);

    const verified = await app.inject({
      method: 'POST',
      url: `/v1/otp/challenges/${challengeId}/verify`,
      payload: { code: delivery.code },
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toEqual({ verified: true });
    expect(await mongo.db(databaseName).collection('otp_challenges').findOne({ challengeId })).toBeNull();
  });

  it('returns the existing active challenge for an idempotent request', async () => {
    const first = await app.inject({ method: 'POST', url: '/v1/otp/challenges', payload: request });
    const second = await app.inject({ method: 'POST', url: '/v1/otp/challenges', payload: request });

    expect(second.statusCode).toBe(200);
    expect(second.json().challengeId).toBe(first.json().challengeId);
  });

  it('rejects incorrect codes, locks after five attempts, and records failures', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/otp/challenges',
      payload: { ...request, idempotencyKey: randomUUID() },
    });
    const challengeId = created.json().challengeId;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/otp/challenges/${challengeId}/verify`,
        payload: { code: '000000' },
      });
      expect(response.statusCode).toBe(401);
    }

    const locked = await app.inject({
      method: 'POST',
      url: `/v1/otp/challenges/${challengeId}/verify`,
      payload: { code: '000000' },
    });
    expect(locked.statusCode).toBe(423);

    const auditCount = await mongo.db(databaseName).collection('audit_events').countDocuments({
      challengeId,
      eventType: 'OTP_VERIFICATION_FAILED',
    });
    expect(auditCount).toBe(5);
  });
});
