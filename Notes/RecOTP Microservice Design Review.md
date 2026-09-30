2.3 RecOTP Microservice Design Review
Summary
RecOTP is being designed as a shared, multi-tenant microservice to generate and verify one-time passwords (OTPs). Its immediate purpose is to address S1 security vulnerabilities in Recruiting and Rapid Hire, with email verification as the first channel and mobile/SMS as a potential follow-on. Rapid Hire is expected to be the first consumer; Recruiting sign-in, sign-up, and application-submission flows are also in scope.

The team has not started coding yet, but has begun solution specifications and infrastructure requests. The main design questions are capacity/retention, read-after-write performance, high availability and disaster recovery, and whether the service should run on MongoDB Atlas or a self-managed deployment in GCP. A focused proof of concept (POC) was proposed before committing to a single-cluster or CQRS architecture.
Takeaways
1. RecOTP is intended to be reusable across products
Initial consumers: Recruiting and Rapid Hire.
Longer-term goal: a shared service that can be used by other products across the Pro suite.
Initial verification channel: email OTP. Mobile/SMS verification may be added later.
The service is needed in addition to identity-provider functionality because some Recruiting workflows—such as application submission—need applicant verification outside the standard sign-in/sign-up experience.
2. The initial data model is broadly defined
The team identified three likely data areas:

Configuration: tenant-specific OTP settings, such as length and delivery channel.
OTP records: the OTP/challenge, tenant and product context, status, timestamps, expiration, validation, attempts, resend/lockout information, and idempotency data.
Audit: audit records may move to Recruiting’s existing audit service rather than remain in RecOTP.

The current sample document is approximately 1 KB. An IP-address field was considered but is no longer in the initial plan.
3. TTL and early cleanup are important
OTP records are transient. The working approach is to use a TTL index and explicitly delete or accelerate expiration after successful validation rather than retain successfully used OTPs until their default expiry. The exact retention period and behavior for unused, resent, failed, or locked-out OTPs still need to be finalized.
4. Capacity estimates need validation before sizing
The conversation produced preliminary estimates, not confirmed requirements:

Roughly 25,000 sign-ins per hour was cited for one data center.
A working extrapolation reached approximately 400,000 OTP writes per hour across four data centers and approximately 600,000 reads per hour, including retries.
A rough upper bound of about 4 million active records was discussed, with approximately 1 KB per document.
Sign-up volume—especially for Rapid Hire/frontline-worker use cases—was not yet known and could materially change the sizing.

The team should separate sign-in, sign-up, application-submission, resend, retry, and verification traffic before finalizing capacity assumptions.
5. Read-after-write latency is the key performance requirement
The user may receive an email and submit the OTP within seconds. The working requirement discussed was that an OTP be readable within 10 seconds maximum after the write, with a preference for approximately 1 second where practical.

Two implementation paths were discussed:

Start with a single cluster and test whether it meets the requirement.
If read performance or write isolation requires it, evaluate CQRS: a write database, a read database, and a change stream to replicate OTP records to the read side.

The team correctly raised the risk that asynchronous replication could make a newly written OTP unavailable when the user immediately submits it. That must be measured, not assumed away.
6. Deployment and resilience strategy are still unresolved
The team discussed MongoDB Atlas, self-managed MongoDB in GCP, and on-prem licensing, but the actual UKG provisioning model needs to be confirmed. The key distinction is whether the GCP platform team is creating Atlas clusters or asking the application team to manage MongoDB infrastructure directly.

Because RecOTP downtime would prevent candidates from signing in or completing flows, high availability is important. If Atlas is selected, the team should define the required multi-region topology, backup policy, RPO, and RTO. If MongoDB is self-managed, the team must define equivalent cross-region/data-center failover, monitoring, backup, and operational ownership.
Decisions and current direction
Build RecOTP as a separate service rather than embedding OTP logic in Recruiting or Rapid Hire.
Start with email OTP verification.
Treat Recruiting and Rapid Hire as the first consumers.
Use transient OTP records with TTL-based cleanup plus early cleanup after successful validation.
Run a POC to compare a single-cluster design with a CQRS/change-stream design against the read-after-write requirement.
Do not finalize cluster sizing, licensing, or cost until traffic, retention, and deployment topology are confirmed.
Atlas versus self-managed GCP/on-prem remains an open decision.
Action items
Owner
Action
Timing / success criterion
UKG RecOTP team — Gajendra, Karan, Salil
Confirm whether the intended GCP path provisions MongoDB Atlas or a self-managed MongoDB deployment; document who owns topology, upgrades, monitoring, backups, and failover.
Before selecting the deployment model.
UKG RecOTP team
Validate traffic assumptions by flow and tenant, including sign-in, sign-up, application submission, retries, resends, and peak hiring events.
Produce a sizing input with average and peak rates.
UKG RecOTP team
Confirm retention and cleanup rules for unused, successfully verified, expired, resent, and locked-out OTPs.
Finalize TTL and deletion semantics before implementation.
UKG RecOTP team
Confirm audit ownership and whether audit records will be written by RecOTP or the existing audit service.
Resolve during service/API design.
UKG RecOTP team
Confirm the committed delivery date. The discussion referenced both November 24 and November 26.
Resolve the discrepancy with the program plan.
UKG RecOTP team
Provide the sample OTP document/schema for the test; a draft sample was already available during the meeting.
Required to start the POC.
MongoDB — Mark / James
Build a focused POC using representative documents and synthetic load, starting with a single cluster and testing CQRS/change streams if needed.
Demonstrate maximum 10-second write-to-read availability; measure replication lag and peak behavior.
MongoDB — Mark / James
Provide sizing and cost guidance after traffic, retention, HA/DR, and deployment inputs are confirmed.
Compare the viable Atlas and self-managed options.
MongoDB — Mark / James
Create or coordinate an external Slack channel with the UKG team, working with UKG’s Slack administrator as needed.
Use the channel for follow-up, sample data, and POC coordination.

Open questions for follow-up
What are the true peak OTP writes and verification reads, especially during mass hiring events?
What is the maximum acceptable OTP lifetime, and should successful verification always trigger immediate deletion?
Is the verification operation required to be strictly read-after-write consistent, or is up to 10 seconds acceptable in all flows?
Does the service need one shared multi-tenant deployment, or are there tenant/product isolation requirements?
What HA/DR targets apply: RPO, RTO, regional failover, and acceptable brief write unavailability during failover?
Who operates the MongoDB deployment in GCP, and what does the existing UKG platform standard support?
Does audit data have separate retention/compliance requirements that prevent TTL-based deletion?
