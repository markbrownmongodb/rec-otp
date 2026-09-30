# rec-otp

Recruiting One Time Password proof of value for UKG.

The current POV is a single-database MongoDB Atlas implementation of an email OTP API with a runnable server and synthetic load runner. CQRS and change streams are intentionally deferred until measured performance demonstrates a need for them.

## Setup

1. Add a MongoDB Atlas connection string to `.env`:

   ```text
   MONGODB_URI=mongodb+srv://...
   MONGODB_DATABASE=rec_otp_pov_test
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the integration tests:

   ```bash
   npm test
   ```

4. Start the API:

   ```bash
   npm start
   ```

5. Run the default Atlas load demonstration in another terminal:

   ```bash
   npm run load-test
   ```

   Configure the demonstration with `LOAD_ITERATIONS`, `LOAD_CONCURRENCY`, and `LOAD_TENANT_ID`.

## API

Create an email challenge:

```bash
curl -X POST http://localhost:3000/v1/otp/challenges \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tenant_demo","productCode":"UKG_PRO","channel":"EMAIL","flowType":"LOGIN","recipient":"jane.doe@example.com","idempotencyKey":"tenant_demo:login:jane.doe@example.com"}'
```

The demo delivery sink is available at `GET /demo/deliveries`. It exposes the generated code only for demonstration and testing; a production email provider must never expose it through an API.

## Defaults

- Six-digit numeric codes
- Ten-minute expiration
- Five verification attempts
- Immediate deletion after successful verification
- TTL cleanup for expired challenges

See `PROJECT_STATUS.md` for scope, decisions, and the next feature handoff.
