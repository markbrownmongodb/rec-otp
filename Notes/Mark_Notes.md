Recruiting Design Review
Recruiting using MongoDB throughout.
Two Teams, 
Salil – 3 years, 1.5 on Recruiting

OTP Application – One Time Password
Very initial phase, designing solution
What collections to procure, thinking 3
Config for OTP, email or SMS, tenant specific
OTP sent is persisted and sent
Audit Logging, might be a separate service to a UKG audit service

Recruiting and Rapid Hire, both get you into the recruiting system.
S1 vulnerabilities.
So, microservice will create and verify the OTP.

Validating emails, and/or validating through phone.
Setting up a microservice as a customer for multiple services in the Pro Suite.
AuthN, AuthZ, will provide functionality at some point, they have the signup page.
So they need their own service.

November 26 delivery timeline
Concerned with size

25000 sign-ins per hour.
400K OTPs per hour.

600K reads per hour.
1KB is document size.

1000000 users, all doing writes at 400K writes per hour,
What is the max size of the write DB at any given time.

Allow for 5000 users.

ACTIONS: See whiteboard sizing notes, let’s build a demo and proof to see if this is performant enough.
