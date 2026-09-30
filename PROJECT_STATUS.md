# Project Status

## Session Handoff

- Main is current through merged PR #2 (`243568d`).
- The completed feature is the runnable server and Atlas-backed synthetic load test.
- Start the next session from a clean `main` branch.
- Do not begin implementation until the next failing test suite has been reviewed and approved.

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

## Next Feature

Add sustained benchmark profiles and reporting for sign-in, sign-up, application submission, retry, resend, and verification traffic, then use those measurements for sizing and the single-database versus CQRS decision.

The next TDD cycle should begin with failing tests for:

- Configurable traffic profiles and request mix
- Sustained duration and target throughput
- Per-operation latency and error reporting
- Persistence cleanup and retained test artifacts
- A benchmark report that distinguishes demonstration results from capacity claims

Open inputs before interpreting results:

- Agreed Atlas tier and deployment topology
- Target duration and concurrency for each profile
- Confirmed peak rates by flow and tenant
- Whether benchmark records should remain in Atlas or be cleaned after inspection
