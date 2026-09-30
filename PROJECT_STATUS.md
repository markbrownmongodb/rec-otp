# Project Status

## Current Feature

The first POV feature provides a Fastify email OTP API backed by one MongoDB Atlas database.

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

## Verification

```bash
npm test
npm run typecheck
```

The integration tests require `MONGODB_URI` and `MONGODB_DATABASE` in the local `.env` file. Each test run uses a unique database suffix and drops that database during teardown.

## Deliberate POV Limitations

- The fake delivery sink is process-local and is not a production provider.
- There is no HTTP server entry point yet; tests use Fastify injection.
- OTP hash secret management is represented by `OTP_HASH_SECRET` and needs deployment secret management.
- There is no load-test harness yet, so the 400,000 writes/hour and 600,000 reads/hour estimates remain unvalidated.
- CQRS/change streams are intentionally not implemented.
- Audit persistence is local to this service for the POV; integration with the UKG audit service remains open.

## Next Feature

Add a runnable server entry point and a synthetic load test that measures single-database write-to-read latency against the ten-second maximum and approximately one-second preference.
