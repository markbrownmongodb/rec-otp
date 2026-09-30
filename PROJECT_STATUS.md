# Project Status

## Session Handoff

- Main is current through merged PR #4 (`84531c1`).
- The completed features are the runnable server, Atlas-backed synthetic load test, and sustained benchmark reporting.
- Start the next session from a clean `main` branch.
- The next session should begin by reviewing and approving the failing tests for the next feature before implementation.

## Current Feature

The POV now provides a runnable Fastify email OTP API and a synthetic load runner backed by one MongoDB Atlas database.

Implemented behavior:

- Multi-tenant challenge fields for tenant, product, channel, flow, and recipient
- Six-digit OTP generation
- HMAC-protected OTP persistence; plaintext codes are not stored in MongoDB
- In-memory fake email delivery sink for demonstration
- Immediate read-after-write verification
- Five-attempt lockout
- Ten-minute TTL expiration
- Immediate challenge deletion after successful verification
- Idempotent active challenge creation
- Persisted creation, failure, and verification audit events
- TTL, idempotency, and audit indexes
- Runnable `npm start` entry point
- Configurable Atlas load demonstration via `npm run load-test`
- Named traffic profiles for balanced, sign-in, sign-up, application submission, retry, resend, and verification flows
- Optional sustained duration and target throughput controls
- Per-operation latency, success/failure, throughput, and demonstration-versus-benchmark reporting
- p50, p95, maximum latency, success, failure, and ten-second acceptance metrics

## Verification

```bash
npm test
npm run typecheck
npm run load-test
```

The integration tests require `MONGODB_URI` and `MONGODB_DATABASE` in the local `.env` file. Each suite drops its named test database during setup, then leaves the database in place after teardown for inspection:

- `${MONGODB_DATABASE}`: API integration tests
- `${MONGODB_DATABASE}_server`: server lifecycle test
- `${MONGODB_DATABASE}_load`: load test

## Deliberate POV Limitations

- The fake delivery sink is process-local and is not a production provider.
- The HTTP server entry point is suitable for the POV only; production deployment, authentication, authorization, and operational configuration remain open.
- OTP hash secret management is represented by `OTP_HASH_SECRET` and needs deployment secret management.
- The load runner validates a configurable synthetic sample; it does not yet prove sustained 400,000 writes/hour or 600,000 reads/hour capacity.
- CQRS/change streams are intentionally not implemented.
- Audit persistence is local to this service for the POV; integration with the UKG audit service remains open.

## Measurement

The default 100-iteration Atlas demonstration completed successfully:

- Successful verifications: 100
- Failed operations: 0
- p50 write-to-read latency: approximately 439 ms
- p95 write-to-read latency: approximately 1,008 ms
- Maximum write-to-read latency: approximately 1,478 ms
- Ten-second maximum: met

This is a small demonstration, not a capacity claim. Larger, sustained tests should be run with agreed Atlas sizing and traffic profiles before extrapolating to the notes' hourly estimates.

The first sustained benchmark smoke run also completed successfully:

- Balanced profile at a ten-operation-per-second target for approximately five seconds
- 57 successful verifications
- 0 failed operations
- Actual throughput: approximately 9.59 operations/second
- p50 latency: approximately 399 ms
- p95 latency: approximately 764 ms
- Maximum latency: approximately 858 ms
- Ten-second maximum: met

This run was intentionally conservative and validates the benchmark path only. It does not demonstrate the target average of approximately 111 OTP creations/second (400,000/hour).

## Next Session

Complete the benchmark and sizing work using agreed production-representative inputs, then use those measurements for the single-database versus CQRS decision.

The next TDD cycle should begin with failing tests for the remaining benchmark behavior:

- Persistence cleanup and retained test artifacts
- Benchmark execution across all profiles with an explicit result artifact
- Validation that benchmark results distinguish demonstrations from capacity claims

After those tests pass:

- Run sign-in, sign-up, application-submission, retry, resend, and verification profiles.
- Compare sustained results with 400,000 writes/hour (approximately 111 writes/second) and the read target.
- Measure database growth and cleanup behavior.
- Produce Atlas sizing and cost guidance.
- Decide whether CQRS/change streams are justified.

Open inputs before interpreting results:

- Agreed Atlas tier and deployment topology
- Confirmed peak rates by flow and tenant
- Whether benchmark records should remain in Atlas or be cleaned after inspection
- Required benchmark duration and concurrency for each traffic profile
- Whether retry and resend should model distinct API semantics rather than the current synthetic flow labels
