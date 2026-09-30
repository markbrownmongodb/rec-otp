type LoadTestOptions = {
  baseUrl: string;
  iterations: number;
  concurrency: number;
  tenantId: string;
};

type LoadTestResult = {
  iterations: number;
  successfulVerifications: number;
  failedOperations: number;
  latencyMs: { p50: number; p95: number; max: number };
  meetsTenSecondMaximum: boolean;
};

type Delivery = { challengeId: string; code: string };

const percentile = (values: number[], percentileValue: number): number => {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values.slice().sort((a, b) => a - b)[index];
};

async function runOne(baseUrl: string, tenantId: string, index: number): Promise<number> {
  const startedAt = performance.now();
  const created = await fetch(`${baseUrl}/v1/otp/challenges`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      productCode: 'UKG_PRO',
      channel: 'EMAIL',
      flowType: 'LOAD_TEST',
      recipient: `load-${index}@example.com`,
      idempotencyKey: `${tenantId}:load:${index}:${crypto.randomUUID()}`,
    }),
  });
  if (created.status !== 201) throw new Error(`Challenge creation failed: ${created.status}`);

  const { challengeId } = await created.json() as { challengeId: string };
  const deliveries = await fetch(`${baseUrl}/demo/deliveries`);
  const delivery = (await deliveries.json() as Delivery[]).find((item) => item.challengeId === challengeId);
  if (!delivery) throw new Error(`Delivery not found for ${challengeId}`);

  const verified = await fetch(`${baseUrl}/v1/otp/challenges/${challengeId}/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: delivery.code }),
  });
  if (verified.status !== 200) throw new Error(`Verification failed: ${verified.status}`);
  return performance.now() - startedAt;
}

export async function runLoadTest({ baseUrl, iterations, concurrency, tenantId }: LoadTestOptions): Promise<LoadTestResult> {
  const latencies: number[] = [];
  let failedOperations = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < iterations) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        latencies.push(await runOne(baseUrl, tenantId, index));
      } catch {
        failedOperations += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const latencyMs = {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: latencies.length === 0 ? 0 : Math.max(...latencies),
  };

  return {
    iterations,
    successfulVerifications: latencies.length,
    failedOperations,
    latencyMs,
    meetsTenSecondMaximum: failedOperations === 0 && latencyMs.max <= 10_000,
  };
}
