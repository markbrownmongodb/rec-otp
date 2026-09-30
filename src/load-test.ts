export type TrafficOperation =
  | 'SIGN_IN'
  | 'SIGN_UP'
  | 'APPLICATION_SUBMISSION'
  | 'RETRY'
  | 'RESEND'
  | 'VERIFICATION';

export type TrafficProfile = {
  name: string;
  mix: Partial<Record<TrafficOperation, number>>;
};

type LoadTestOptions = {
  baseUrl: string;
  iterations: number;
  concurrency: number;
  tenantId: string;
  profile?: TrafficProfile;
  durationMs?: number;
  targetThroughput?: number;
};

type OperationResult = {
  iterations: number;
  successful: number;
  failed: number;
  latencyMs: { p50: number; p95: number; max: number };
};

export type LoadTestResult = {
  iterations: number;
  successfulVerifications: number;
  failedOperations: number;
  latencyMs: { p50: number; p95: number; max: number };
  meetsTenSecondMaximum: boolean;
  profile: string;
  reportType: 'demonstration' | 'sustained-benchmark';
  durationMs: number;
  throughput: number;
  operations: Record<TrafficOperation, OperationResult>;
};

type Delivery = { challengeId: string; code: string };

export const defaultTrafficProfile: TrafficProfile = {
  name: 'balanced',
  mix: {
    SIGN_IN: 35,
    SIGN_UP: 15,
    APPLICATION_SUBMISSION: 15,
    RETRY: 10,
    RESEND: 10,
    VERIFICATION: 15,
  },
};

export const trafficProfiles: Record<string, TrafficProfile> = {
  balanced: defaultTrafficProfile,
  'sign-in': { name: 'sign-in', mix: { SIGN_IN: 1 } },
  'sign-up': { name: 'sign-up', mix: { SIGN_UP: 1 } },
  'application-submission': { name: 'application-submission', mix: { APPLICATION_SUBMISSION: 1 } },
  retry: { name: 'retry', mix: { RETRY: 1 } },
  resend: { name: 'resend', mix: { RESEND: 1 } },
  verification: { name: 'verification', mix: { VERIFICATION: 1 } },
};

const operations = Object.keys(defaultTrafficProfile.mix) as TrafficOperation[];

const percentile = (values: number[], percentileValue: number): number => {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values.slice().sort((a, b) => a - b)[index];
};

const chooseOperation = (profile: TrafficProfile): TrafficOperation => {
  const entries = operations
    .map((operation) => [operation, profile.mix[operation] ?? 0] as const)
    .filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) throw new Error('Traffic profile must contain a positive operation weight.');
  let selected = Math.random() * total;
  for (const [operation, weight] of entries) {
    selected -= weight;
    if (selected < 0) return operation;
  }
  return entries[entries.length - 1][0];
};

async function runOne(baseUrl: string, tenantId: string, index: number, operation: TrafficOperation): Promise<number> {
  const startedAt = performance.now();
  const created = await fetch(`${baseUrl}/v1/otp/challenges`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      productCode: 'UKG_PRO',
      channel: 'EMAIL',
      flowType: operation,
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

export async function runLoadTest(options: LoadTestOptions): Promise<LoadTestResult> {
  const { baseUrl, iterations, concurrency, tenantId } = options;
  const profile = options.profile ?? defaultTrafficProfile;
  const startedAt = performance.now();
  const latencies: number[] = [];
  const operationLatencies = new Map<TrafficOperation, number[]>();
  const operationFailures = new Map<TrafficOperation, number>();
  for (const operation of operations) operationLatencies.set(operation, []);
  for (const operation of operations) operationFailures.set(operation, 0);
  let failedOperations = 0;
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < iterations
      && (options.durationMs === undefined || performance.now() - startedAt < options.durationMs)) {
      const index = nextIndex;
      nextIndex += 1;
      if (options.targetThroughput && options.targetThroughput > 0) {
        const scheduledAt = startedAt + (index / options.targetThroughput) * 1000;
        const delay = scheduledAt - performance.now();
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      }
      const operation = chooseOperation(profile);
      try {
        const latency = await runOne(baseUrl, tenantId, index, operation);
        latencies.push(latency);
        operationLatencies.get(operation)?.push(latency);
      } catch {
        failedOperations += 1;
        operationFailures.set(operation, (operationFailures.get(operation) ?? 0) + 1);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const latencyMs = {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: latencies.length === 0 ? 0 : Math.max(...latencies),
  };
  const elapsedMs = Math.max(1, performance.now() - startedAt);
  const operationMetrics = Object.fromEntries(operations.map((operation) => {
    const values = operationLatencies.get(operation) ?? [];
    const failed = operationFailures.get(operation) ?? 0;
    return [operation, {
      iterations: values.length + failed,
      successful: values.length,
      failed,
      latencyMs: {
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        max: values.length === 0 ? 0 : Math.max(...values),
      },
    }];
  })) as Record<TrafficOperation, OperationResult>;

  return {
    iterations,
    successfulVerifications: latencies.length,
    failedOperations,
    latencyMs,
    meetsTenSecondMaximum: failedOperations === 0 && latencyMs.max <= 10_000,
    profile: profile.name,
    reportType: options.durationMs !== undefined || options.targetThroughput !== undefined
      ? 'sustained-benchmark'
      : 'demonstration',
    durationMs: elapsedMs,
    throughput: (latencies.length + failedOperations) / (elapsedMs / 1000),
    operations: operationMetrics,
  };
}
