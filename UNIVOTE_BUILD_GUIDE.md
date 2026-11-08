## Security technologies used in UniVote

Your project uses several layers of security rather than depending on one technology.

### 1. WebAuthn / Passkeys

**Technology:** `@simplewebauthn/server` and `@simplewebauthn/browser`

WebAuthn is used for biometric or passkey verification. The system can work with:

- fingerprint;
- face unlock;
- device PIN;
- security key;
- synced passkey.

Important clarification:

> UniVote does not store the student’s fingerprint or face data. The biometric verification is performed by the device. UniVote receives a cryptographic authentication response.

The server verifies:

- the authentication challenge;
- the expected website origin;
- the relying-party ID;
- the credential;
- the authenticator signature counter.

Relevant implementation: `webauthn.service.ts`

---

### 2. Bcrypt password hashing

**Technology:** `bcrypt`

Student and administrator passwords are not stored as plain text. They are converted into one-way bcrypt hashes.

If the database is compromised, the attacker does not immediately obtain the original passwords.

Good presentation answer:

> Passwords are protected using bcrypt because it is a deliberately slow hashing algorithm. The cost makes large-scale password guessing more difficult than using a fast hash such as MD5 or SHA-256 directly.

---

### 3. JWT authentication

**Technology:** `jsonwebtoken`

The system uses JSON Web Tokens for authenticated sessions.

There are separate token concepts:

- `SESSION` token — proves that the user has logged in;
- `BALLOT` token — specifically authorizes voting in one election.

The ballot token is scoped to:

- one voter;
- one election;
- one institution;
- one tenant schema.

This prevents a ballot token created for one election or institution from being reused elsewhere.

Relevant implementation: `jwt.service.ts`

---

### 4. Single-use ballot tokens

After a ballot is successfully submitted, the ballot token is blocked using its unique JWT ID, known as `jti`.

This helps prevent a student from reusing the same authorization token to submit multiple ballots.

The system also enforces one vote per student through a database constraint in `ElectionParticipant`.

Relevant implementation: `tokenBlocklist.ts`

---

### 5. AES-256 encryption

**Technology:** Node.js cryptography APIs with AES-256

The timestamp associated with a ballot is encrypted before being stored.

WebAuthn public key material is also encrypted at rest because the original key is required later for WebAuthn verification.

Good answer:

> Encryption protects data so that it cannot be understood without the encryption key. UniVote uses AES-256 for sensitive reversible data, such as encrypted timestamps and stored WebAuthn public-key material.

Relevant implementation: `encrypt.ts`

---

### 6. SHA-256 hashing and integrity checking

**Technology:** SHA-256 hashing

Each ballot receives a hash calculated from ballot information. The hash is used as a tamper-evident integrity value.

The system also creates a salted hash of stored WebAuthn public-key material.

Difference between encryption and hashing:

| Encryption | Hashing |
|---|---|
| Reversible with a key | Designed to be one-way |
| Used when the original value is needed again | Used for verification and integrity |
| Example: AES-256 | Example: SHA-256 or bcrypt |

Relevant implementations:

- `hash.ts`
- `salt.ts`

---

### 7. Anonymous ballot storage

The `Ballot` table does not contain a `VoterID`.

Instead:

- `Ballot` stores the selected candidate;
- `ElectionParticipant` records that a voter has participated.

This means the system can enforce one vote per student without directly storing the student identity alongside the vote choice.

This is one of the strongest points to explain to your supervisor.

However, be precise:

> The design prevents the ballot table from directly linking a voter to a candidate. It should not be described as mathematically perfect anonymity, because database administrators, logs, timestamps, or other operational data could potentially create indirect correlations.

Relevant schema: `schema.prisma`

---

### 8. Tenant isolation

**Technology:** PostgreSQL schema-per-tenant architecture

Each institution has a separate PostgreSQL schema.

For example:

```text
public       -> global institution registry
institution_a -> institution A voters and elections
institution_b -> institution B voters and elections
```

The tenant resolver identifies the institution, and the API creates or selects the correct tenant-specific Prisma client.

This reduces the risk of one institution accessing another institution's voter records.

Relevant implementation: `tenantResolver.ts`

---

### 9. Role-based access control

The application has three roles:

- `SUPER_ADMIN`;
- `SCHOOL_ADMIN`;
- `STUDENT`.

The API protects routes according to role. For example:

- students cannot create elections;
- school administrators cannot manage the entire platform;
- Super Admin operations are separated from tenant operations.

Relevant implementation: `authGuard.ts`

---

### 10. Input validation and business-rule validation

The system validates:

- required election fields;
- candidate selections;
- candidate ownership by election;
- one candidate per office;
- one candidate for every required office;
- election status;
- tenant and election token scope;
- uploaded candidate images.

This prevents invalid or manipulated requests from being accepted simply because they came from the browser.

A good answer is:

> Frontend validation improves user experience, but the API performs the real security validation because users can bypass browser interfaces and send requests directly.

---

### 11. Database transactions and constraints

Ballot creation and participation registration happen in one database transaction.

If one operation fails, both are rolled back.

The database also has a unique constraint on:

```text
ElectionID + VoterID
```

This protects against duplicate voting, including simultaneous requests.

Relevant implementation: `ballot.service.ts`

---

### 12. Rate limiting

**Technology:** `express-rate-limit`

Rate limiting is used to reduce:

- password-guessing attacks;
- repeated login attempts;
- authentication challenge abuse;
- denial-of-service through excessive requests.

Relevant implementation: `rateLimiter.ts`

---

### 13. HTTP security headers

**Technology:** Helmet

Helmet configures common HTTP security headers in the Express application.

It helps reduce risks related to:

- unsafe browser behavior;
- clickjacking;
- MIME-type confusion;
- certain cross-site attacks.

Relevant implementation: `app.ts`

---

### 14. HTTPS and secure WebAuthn origin

WebAuthn requires a trusted origin in production. The system uses:

```text
RP_ID
ORIGIN
```

These values must match the real website configuration.

For example, if the application runs at:

```text
https://univote.example.com
```

the origin must be configured consistently.

This is essential because WebAuthn is designed to prevent authentication credentials from being used by fake websites.

---

## Important security questions your supervisor may ask

### Question 1: What makes your system secure?

Suggested answer:

> UniVote uses defence in depth. It combines bcrypt password hashing, JWT authentication, WebAuthn passkeys, role-based access control, tenant isolation, rate limiting, Helmet security headers, database constraints, transaction-based ballot storage, AES encryption, SHA-256 integrity hashes, and single-use election-specific ballot tokens.

Avoid saying that one technology alone makes the system secure.

---

### Question 2: How do you prevent duplicate voting?

Suggested answer:

> Duplicate voting is prevented at multiple levels. The system checks whether the student has already participated, issues a single-use ballot token, blocks the token after submission, and enforces a database-level unique constraint on `ElectionID` and `VoterID`. The database constraint is the final protection because it also handles simultaneous requests.

---

### Question 3: How do you preserve ballot anonymity?

Suggested answer:

> The `Ballot` table does not contain `VoterID`. The system stores voting participation separately in `ElectionParticipant`. This allows UniVote to know whether a student has voted without directly storing the student identity next to the selected candidate.

You can add:

> This protects the database design from direct voter-to-choice association, although complete operational anonymity also requires careful logging, administrator access, and deployment controls.

---

### Question 4: Are you storing fingerprints?

Suggested answer:

> No. UniVote does not receive or store raw fingerprints, face templates, or biometric images. The device’s authenticator performs the biometric check and returns a cryptographic WebAuthn response. The server verifies that response.

---

### Question 5: Why did you use WebAuthn?

Suggested answer:

> Passwords can be guessed, reused, or stolen through phishing. WebAuthn adds possession of a registered authenticator and user verification on the device. It also binds authentication to the legitimate website origin, making phishing more difficult.

---

### Question 6: Why use both a password and WebAuthn?

Suggested answer:

> The password identifies and authenticates the account initially. WebAuthn provides a stronger second step before voting. The system therefore separates ordinary account access from the higher-risk action of casting a ballot.

A more technical description is:

> The password creates a session, but only successful WebAuthn verification followed by eligibility validation creates a ballot token.

---

### Question 7: What happens if somebody steals a session token?

Suggested answer:

> A stolen session token does not directly authorize voting. The attacker would still need to complete the WebAuthn voting handshake before the API issues a ballot token. Ballot tokens are short-lived, scoped to one election and tenant, and invalidated after use.

Important limitation:

> Token theft is still serious because the attacker may access whatever the session token permits. Production deployment should use HTTPS, secure storage, short expiry periods, monitoring, and token revocation procedures.

---

### Question 8: What happens if somebody steals a ballot token?

Suggested answer:

> The token is short-lived and scoped to one election and institution. The API checks the token against the request path and tenant. It also requires valid candidate selections, and the token is blocked after a successful vote.

A careful limitation:

> A ballot token is intended to authorize the vote. If an attacker obtains a valid unused ballot token, the token should be treated as sensitive. This is why HTTPS, secure browser storage, short expiry, and WebAuthn protection are important.

---

### Question 9: How do you stop one school from seeing another school's data?

Suggested answer:

> Each institution has a separate PostgreSQL schema. The tenant resolver determines the institution before tenant-scoped requests are processed. The API then uses a tenant-specific Prisma client. Ballot tokens also contain tenant scope, and the API rejects tokens used with another institution.

---

### Question 10: What happens if a user changes the institution code in a request?

Suggested answer:

> The API does not rely only on the browser or frontend. It resolves the tenant on the server and checks the tenant claims in the authenticated token. A ballot token whose tenant schema does not match the current request is rejected.

---

### Question 11: How do you protect passwords in the database?

Suggested answer:

> Passwords are processed with bcrypt before storage. The original password is never stored. During login, bcrypt verifies the entered password against the stored hash.

---

### Question 12: Why not use SHA-256 for passwords?

Suggested answer:

> SHA-256 is a fast general-purpose hash. Fast hashes are not ideal for passwords because attackers can test many guesses quickly. Bcrypt is intentionally slower and includes a work factor, making password cracking more expensive.

---

### Question 13: What is the difference between encryption and hashing in your system?

Suggested answer:

> Encryption is reversible with a secret key and is used for data that the application must later recover, such as encrypted timestamps or WebAuthn key material. Hashing is intended to be one-way and is used for integrity checks, such as ballot hashes. Passwords use bcrypt, which is a specialized password-hashing algorithm.

---

### Question 14: How do you protect against SQL injection?

Suggested answer:

> Database access is performed through Prisma's typed query API rather than by concatenating untrusted strings into SQL statements. Input validation is also applied at the API boundary. Raw SQL should only be used in controlled migration or provisioning operations.

Do not claim “SQL injection is impossible.” Say that the architecture reduces the risk and that secure development and testing are still required.

---

### Question 15: How do you validate a ballot?

Suggested answer:

> The API verifies that the selected candidate IDs belong to the election, that candidate IDs are unique, that no more than one candidate is selected for an office, and that every configured office has a selection. The API does not trust the frontend.

---

### Question 16: What happens if two vote requests arrive at the same time?

Suggested answer:

> The ballot rows and the `ElectionParticipant` record are written in a database transaction. The unique constraint on `ElectionID` and `VoterID` allows only one participation record. If the second request violates the constraint, its transaction fails and no partial ballot remains.

---

### Question 17: What happens if the database crashes while a vote is being saved?

Suggested answer:

> The transaction provides atomicity. The system should either commit the complete ballot operation or roll it back. The `/ready` endpoint also checks database readiness. However, production still requires PostgreSQL backups, monitoring, and recovery procedures.

---

### Question 18: What is the purpose of rate limiting?

Suggested answer:

> Rate limiting restricts repeated requests from the same client, especially around login and authentication endpoints. It reduces password brute-force attempts and protects the API from simple request flooding.

---

### Question 19: What is the purpose of the `ORIGIN` and `RP_ID` settings?

Suggested answer:

> They identify the legitimate website and relying party for WebAuthn. The server verifies that authentication responses were created for the expected application, which helps prevent credentials from being reused by a malicious website.

---

### Question 20: What are the main limitations of your security design?

A strong answer is honest:

> The platform is a project prototype that still requires production hardening. Important future work includes formal penetration testing, centralized audit logging, monitoring and alerting, key rotation, backup and disaster recovery, strict production CORS configuration, secure cookie or token-storage review, and a formal privacy assessment of logs and administrative access.

## Security points you should not overclaim

Be careful with these statements:

### Do not say: “The system is completely anonymous.”

Say:

> The ballot schema prevents a direct voter identity from being stored with the vote choice. Operational anonymity also depends on access control, logs, database administration, and deployment configuration.

### Do not say: “Biometric data is stored securely.”

Say:

> Biometric data is not stored by UniVote. The authenticator on the user’s device performs the biometric check, while UniVote stores and verifies WebAuthn credential information.

### Do not say: “JWT makes the application secure.”

Say:

> JWT is used for stateless authentication and authorization. Its security depends on strong secrets, proper expiry, HTTPS, scope validation, and secure storage.

### Do not say: “Encryption protects everything.”

Say:

> Encryption protects selected sensitive data at rest. Other controls are needed for authentication, authorization, integrity, availability, and privacy.

## A short answer you can memorize

> UniVote uses defence-in-depth security. Passwords are protected with bcrypt, while WebAuthn provides a stronger passkey or biometric authentication step before voting. JWTs separate normal sessions from short-lived, election-specific ballot authorization. PostgreSQL schema-per-tenant isolation separates institutions. Ballots do not contain voter IDs, and one-vote-per-student enforcement is implemented using a transaction and a database unique constraint. AES-256 protects reversible sensitive values, SHA-256 protects integrity, Helmet adds HTTP security headers, rate limiting reduces brute-force attacks, and role guards control access to each portal. The system still requires production hardening such as penetration testing, audit logging, monitoring, key rotation, and backup procedures.
React 18 for the user interface
Vite as the frontend build and development tool
TypeScript
React Router for page navigation
Tailwind CSS for styling
Vite PWA plugin for Progressive Web App functionality
Node.js — runtime environment
Express.js — web/API framework
TypeScript — backend programming language
Prisma ORM — database access and type-safe queries
PostgreSQL 16 — relational database
JWT — session and authorization tokens
bcrypt — password hashing
WebAuthn/FIDO2 — passkey and biometric authentication
Helmet — HTTP security headers
CORS — cross-origin request control
express-rate-limit — protection against repeated login/API requests
Multer — candidate image uploads