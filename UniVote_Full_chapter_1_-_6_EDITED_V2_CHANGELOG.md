# UniVote document V2 changelog

Source: UniVote_Full_chapter_1_-_6_EDITED.docx. Output: UniVote_Full_chapter_1_-_6_EDITED_V2.docx. The source was not modified. Existing figures and positions are retained; figure artwork is corrected. No screenshots were added, per the latest instruction.

## Part A: WebAuthn code review

| Item | Status | Evidence |
|---|---|---|
| 1. userVerification requested | Correct | apps/api/src/modules/auth/webauthn.service.ts:55-58, 115-121 |
| 2. Server enforces user-verified flag | Correct | @simplewebauthn/server 9.0.3 defaults requireUserVerification to true; registration rejects unset flags.uv at node_modules/@simplewebauthn/server/esm/registration/verifyRegistrationResponse.js:119-120; authentication rejects it at node_modules/@simplewebauthn/server/esm/authentication/verifyAuthenticationResponse.js:142-143. |
| 3. Challenge handling | Correct, with scope note | Library-generated challenge; apps/api/src/lib/challengeStore.ts:12-28 stores it per voter and purpose for five minutes and deletes on consume. It is voter-bound, not bound to a distinct session ID. Student-session checks are in apps/api/src/modules/auth/auth.routes.ts:64-97. |
| 4. Origin and RP ID | Correct | apps/api/src/modules/auth/webauthn.service.ts:70-75, 148-158. |
| 5. Signature counter | Correct | apps/api/src/modules/auth/webauthn.service.ts:148-176. |
| 6. Credential fields/protection | Correctly identified | apps/api/prisma/tenant/schema.prisma:43-57; apps/api/src/modules/auth/webauthn.service.ts:81-100; apps/api/src/crypto/encrypt.ts:23-35. |

No code changes or tests were added: items 1 and 2 were already enforced by the installed library defaults, and c.md says to leave correct items unchanged. No integration or end-to-end tests were run.

## Document changes

### 1. FR-02 requirement

Old text:

The system shall support cross-device 1:1 biometric verification by enrolling a voter’s biometric signature once and persisting a salted, one-way mathematical hash (template) of that signature in encrypted cloud storage. Upon authentication on any compatible device, the presented biometric is hashed using the same system-specific salt and compared against the stored template. Access is granted only when the comparison confirms a 1:1 match with the registered voter’s biometric signature. The system shall enforce a Biometric Handshake as a mandatory second authentication factor after credential login, and shall deny ballot token issuance to any session that does not complete a successful biometric verification.

New text:

The system shall require device-native user verification through WebAuthn (biometric or device PIN) before issuing a ballot token. The server shall accept only a cryptographically verified response associated with the voter's registered credential.

### 2. FR-02 name

Old text:

Roaming Biometric Identity Persistence

New text:

WebAuthn Identity Assurance

### 3. FR-02 components

Old text:

Roaming Identity Module / Encrypted Template Store / Biometric Verification Engine

New text:

WebAuthn Credential Registration / Credential Verifier

### 4. NFR-02 name

Old text:

Biometric Data Privacy (Encrypted Cloud Storage)

New text:

User Verification Privacy (Local Processing)

### 5. NFR-02 requirement

Old text:

The system shall store biometric data exclusively as a salted, one-way cryptographic hash (template) in encrypted cloud storage. The raw biometric image or sensor reading shall never be transmitted to or retained on the UniVote server at any stage. All hashing and salting operations shall be performed on the student’s device prior to transmission. The encrypted template shall be accessible only by the authenticated voter’s session and the UniVote Verification Engine, enforced through tenant-scoped access controls.

New text:

The system shall not store or process raw biometric data. User verification shall be performed locally by the voter's authenticator.

### 6. NFR-02 rationale

Old text:

Storing a salted hash rather than a raw biometric template ensures that even if the encrypted store is compromised, the attacker obtains a mathematically irreversible artefact that is both system-specific and computationally infeasible to reverse-engineer into the original biometric signature. This satisfies the CIA Triad Confidentiality requirement and ensures compliance with data protection principles by preventing UniVote from becoming a viable target for biometric identity theft.

New text:

WebAuthn user verification is performed by the authenticator on the device. UniVote receives a cryptographic response rather than a biometric sample and does not store raw biometric data. This limits the collection of sensitive identity data while allowing an authenticator to use a biometric or device PIN.

### 7. NFR-06 name

Old text:

Biometric Non-Transferability (Salting)

New text:

Credential Data Protection

### 8. NFR-06 requirement

Old text:

All biometric templates shall be combined with a System-Specific Salt — a unique, server-generated value bound to the UniVote deployment — before the one-way hash is computed. The salted hash shall be stored in the encrypted template store; the salt value itself shall be maintained separately in the UniVote key management service and shall never be co-located with the biometric template.

New text:

Credential data held by the system shall be protected so that a database leak does not allow a credential to be used to authenticate.

### 9. NFR-06 rationale

Old text:

The System-Specific Salt ensures that a biometric template extracted from the UniVote store is cryptographically locked to this system and cannot be replayed or used to spoof the voter’s identity on external platforms such as banking applications or government identity systems. This property of Non-Transferability is essential for responsible biometric data stewardship and directly supports the Confidentiality component of the CIA Triad.

New text:

WebAuthn uses a key pair: the server verifies a response using the registered public key, while the authenticator retains the private signing key. UniVote encrypts the stored public key and keeps a salted integrity hash so that a database disclosure alone does not provide the private key needed to create an authenticator response.

### 10. Objective iii

Old text:

iii.  To integrate identity assurance through Multi-Factor Authentication (MFA), specifically utilising device-native user verification through WebAuthn, to strengthen confidence that the authorised account holder is accessing the ballot.

New text:

iii. To strengthen identity assurance by requiring device-native user verification through WebAuthn (biometric or device PIN) before a ballot token is issued to a student signed in with registered account credentials.

### 11. Figure 1 caption

Old text:

Figure 1: UniVote Conceptual Framework (updated to include Biometric MFA in the Security Pillar)

New text:

Figure 1: UniVote Conceptual Framework (updated to include WebAuthn user verification in the Security Pillar)

### 12. Chapter 1 security

Old text:

Security in e-voting is often defined by the "CIA Triad": Confidentiality, Integrity, and Availability [1]. In this project, Confidentiality is maintained by ensuring that a student's vote is anonymous and cannot be linked back to their identity once cast. Integrity is managed through cryptographic hashing and JWT; once a vote is submitted, it is timestamped and hashed to ensure it cannot be altered. Availability is ensured by the stateless nature of Node.js, which allows the system to handle high volumes of concurrent traffic during peak voting hours. This pillar is further strengthened through Identity Assurance via Multi-Factor Authentication (MFA), specifically utilising device-native biometric sensors — fingerprint and facial recognition — to ensure that the individual accessing the ballot is the physical owner of the authorised account. This biometric layer directly closes the voter impersonation vulnerability identified by Atuah et al. [3], providing a provable, hardware-backed link between the authenticated digital identity and the physical student casting the vote.

New text:

Security in e-voting is often defined by the CIA Triad: Confidentiality, Integrity, and Availability [1]. In this project, Confidentiality is maintained by ensuring that a student's vote cannot be linked back to their identity once cast. Integrity is supported through cryptographic hashing and JWTs; a submitted vote is timestamped and hashed so that a later alteration can be detected. Availability is a design objective supported by the Node.js architecture, but it was not measured in this evaluation. Identity assurance is added through WebAuthn after account sign-in. The device authenticator performs user verification locally (biometric or device PIN) before returning a cryptographic response that the server verifies against the registered credential. UniVote does not receive the biometric sample and cannot establish which local method was used. This provides an additional verification step, but it does not prove that the account holder is the physical owner of the device or establish that impersonation has been eliminated.

### 13. Chapter 2 proposed approach

Old text:

UniVote further incorporates Identity Assurance through Multi-Factor Authentication (MFA) as described in the Security Pillar of the conceptual framework. Device-native biometric sensors — fingerprint scanners and facial recognition — are used to verify that the individual accessing the ballot is the physical owner of the authorised account. This approach requires no dedicated biometric hardware, instead leveraging sensors already present in modern student devices, making it a scalable and cost-effective solution that directly addresses the weak authentication vulnerabilities documented by Atuah et al. [3].

New text:

UniVote incorporates identity assurance through WebAuthn as described in the Security Pillar. After the student signs in, the device authenticator performs user verification locally (biometric or device PIN) and returns a cryptographic response for server verification against the registered credential. UniVote receives no biometric sample. Because the authenticator may use a device PIN, the system can confirm user verification but cannot establish that a particular biometric was used. This feature adds a verification step to account credentials in response to weak-authentication concerns documented by Atuah et al. [3], without claiming to eliminate impersonation.

### 14. Student stakeholder

Old text:

Student (Voter) — The student is the primary end-user of the system. The student signs in, completes the supported WebAuthn user-verification process and casts a ballot when the registered account is active, the election is open and no prior participation is recorded. These needs drive the authentication and ballot-casting interfaces.

New text:

Student (Voter) — The student is the primary end-user of the system. The student signs in, completes WebAuthn user verification (biometric or device PIN) when ballot access is requested, and casts a ballot when the account is active, the election is open and no prior participation is recorded. These needs drive the authentication and ballot-casting interfaces.

### 15. Chapter 3 validation

Old text:

The validation strategy centres on a phased UAT programme conducted with a representative pilot group drawn from ZUT’s student body and administrative staff. The pilot group will be selected to reflect the diversity of device types, operating system versions, and biometric sensor hardware common among Zambian university students — specifically including entry-level Android devices, which represent the majority of the student device ecosystem. Device diversity is critical because the Roaming Biometric Identity module must function correctly across hardware manufactured by different vendors, ensuring that a voter who enrols on one device can authenticate successfully on any other compatible device without requiring re-enrolment.

New text:

The planned validation strategy anticipated a representative group of students and administrative staff using a range of device types and operating systems. WebAuthn credentials may be synchronized by a passkey provider or provisioned separately on another authenticator. Cross-device authentication was not evaluated, so the report does not claim that a credential enrolled on one device was available on another.

### 16. Chapter 3 summary

Old text:

Three stakeholder groups were identified — Super Administrators, School Administrators, and Students — whose distinct operational needs drive the system’s three-tier portal architecture. Requirements were gathered through Technical Consultations and Document Analysis of existing processes at ZUT and UNZA, ensuring the system is grounded in the specific institutional context of Zambian higher education. The Roaming Biometric Identity model adopted in FR-02 and NFR-06 directly resolves two endemic flaws documented in comparable institutional e-voting deployments: the Password-Sharing vulnerability, in which credentials are freely transferred between students, and the Device-Dependency flaw, in which a voter’s biometric identity is locked to a single piece of hardware and becomes inaccessible if that device is unavailable on election day. By binding identity verification to the voter’s biometric signature rather than to any credential or device, UniVote provides a high-integrity, roaming electoral identity that is both secure and practically accessible across the heterogeneous device landscape of Zambian higher education.

New text:

Three stakeholder groups were identified — Super Administrators, School Administrators, and Students — whose distinct operational needs drive the system's three-tier portal architecture. Requirements were gathered through Technical Consultations and Document Analysis of existing processes at ZUT and UNZA. The identity-assurance requirement in FR-02 uses WebAuthn and local user verification as an additional step after account sign-in. A device authenticator may verify locally with a biometric or PIN and signs a challenge with the credential's private key; UniVote verifies the returned response against the registered credential. Availability of a passkey on another device depends on synchronization or separate provisioning. The evaluation did not assess cross-device use, so device-independent authentication is not claimed.

### 17. Chapter 4 introduction

Old text:

Chapter Four marks the transition from specification to realisation. Building directly upon the functional and non-functional requirements established in Chapter Three, this chapter presents the architectural design, software design, component specifications, development toolchain, and deployment strategy for UniVote — a multi-tenant Progressive Web Application (PWA) designed to deliver secure, transparent, and institutionally isolated digital elections across Zambian higher learning institutions.

New text:

Chapter Four marks the transition from specification to realisation. Building on the requirements established in Chapter Three, it presents UniVote's architecture, software design, component specifications, development toolchain and deployment strategy. Section 4.2 presents the three-tier architecture; Section 4.3 covers WebAuthn registration and authentication; Section 4.4 describes development and testing; Section 4.5 describes the credential store and deployment; and Section 4.6 summarises the design.

### 18. Chapter 4 design overview

Old text:

Software design encompasses the detailed specification of UniVote’s individual system components, the interfaces between them, and the data structures they operate upon. This section presents the design of the WebAuthn Biometric Handshake flow — the most security-critical component of the system — followed by the software design tools employed and the full component design, including UML models and the core database schema.

New text:

Software design encompasses the detailed specification of UniVote's components, interfaces and data structures. This section presents the WebAuthn registration and authentication flow, the software design tools, component models and core database schema.

### 19. Lucidchart purpose

Old text:

Sequence Diagram for the WebAuthn Roaming Identity flow and the State Machine Diagram for the ballot lifecycle.

New text:

Sequence diagram for WebAuthn registration and authentication, and the state-machine diagram for the ballot lifecycle.

### 20. Contextual model

Old text:

The Contextual Model defines UniVote's boundaries and its interactions with external entities. The system interacts with the student's browser and device authenticator for WebAuthn user verification, and with institutional administrators who manage the voter roll and elections. The code also supports an optional external roster service for voter import and status checks when an endpoint and credentials are configured. The application uses tenant-specific routing and tenant-scoped database access. These interactions define the system boundary; an external roster service is optional and the system does not use a biometric template store.

New text:

The Contextual Model defines UniVote's boundaries and its interactions with external entities. The system interacts with the student's browser and device authenticator for WebAuthn user verification, and with institutional administrators who manage the voter roll and elections. Optional external roster services support voter import and status checks when configured. The application uses tenant-specific routing and tenant-scoped database access. The device authenticator performs user verification locally; UniVote receives the cryptographic response and does not receive biometric samples.

### 21. Sequence diagram heading

Old text:

4.3.2.3 Sequence Diagram — WebAuthn Roaming Identity Flow

New text:

4.3.2.3 Sequence Diagram — WebAuthn Registration and Authentication Flow

### 22. Sequence diagram intro

Old text:

The Sequence Diagram for the WebAuthn Roaming Identity flow documents the most security-critical interaction in the UniVote system: the complete authentication sequence from credential submission to ballot token issuance. This flow implements FR-02 (Roaming Biometric Identity Persistence), NFR-02 (Encrypted Cloud Storage), and NFR-06 (Biometric Non-Transferability) as specified in Chapter Three.

New text:

The sequence diagram describes the student's authenticated session and the WebAuthn steps used for credential registration and ballot authorization. It relates to FR-02 (WebAuthn Identity Assurance), NFR-02 (local user verification and data minimisation), and NFR-06 (credential data protection) as specified in Chapter Three.

### 23. Sequence diagram steps 1

Old text:

The sequence proceeds as follows. The student submits their credentials (Student ID and password hash) to the Authentication API. The API verifies the credential against the Voter Table and, upon success, retrieves the voter’s Credential Record from the Credential Table. The API then generates a cryptographic challenge — a server-side random nonce — and transmits it to the client along with the voter’s credential metadata. The React.js client invokes the browser’s WebAuthn API (navigator.credentials.get()), passing the challenge and the credential descriptor. The browser delegates the biometric sensing to the device’s operating system, which activates the fingerprint scanner or facial recognition sensor. The device’s biometric subsystem produces a WebAuthn assertion: a cryptographic signature over the challenge, generated using the private key associated with the voter’s registered credential. This assertion is returned to the client without any raw biometric data leaving the device.

New text:

After the student signs in, the Student Portal starts WebAuthn registration or, when ballot authorization is required, authentication. The API generates options with the configured RP ID and user verification set to required. The WebAuthn library generates a random challenge. The API stores the challenge in memory under the voter ID and operation, with a five-minute expiry. The browser passes the options to navigator.credentials.create() for registration or navigator.credentials.get() for authentication. The device authenticator performs local user verification (biometric or device PIN) and returns an attestation or signed assertion. UniVote receives the WebAuthn response, not the biometric sample.

### 24. Sequence diagram steps 2

Old text:

The client transmits the WebAuthn assertion to the Authentication API. The API retrieves the voter’s Salted_PublicKey_Hash from the Credential Table and forwards the assertion to the Roaming Identity Verification Engine. The engine verifies the assertion’s cryptographic signature against the stored public key hash, confirms that the challenge nonce matches the one issued in the previous step, and verifies that the assertion’s SignCount is strictly greater than the last recorded SignCount in the Credential Table — this counter increment check detects credential cloning attempts. If all three verifications pass, the engine returns a positive identity confirmation to the Authentication API. The API then issues a signed JWT ballot token scoped to the voter’s tenant and the current election session. This token is short-lived (30 minutes maximum, per NFR-04) and single-use, and its issuance is recorded in the audit log.

New text:

On completion, the API consumes the matching challenge once and verifies the response against the expected challenge, configured origin and RP ID. The server-side WebAuthn library rejects registration or authentication responses whose authenticator data does not contain the user-verified flag. During registration, UniVote stores CredentialID, VoterID, a salted SHA-256 integrity hash for the public key, the AES-256-encrypted public key, SignCount, CreatedAt and LastUsedAt. During authentication, the API decrypts the public key, recomputes its integrity hash, verifies the signature and checks the counter when it is non-zero. The counter and last-used time are then updated. A ballot token is issued only after WebAuthn verification and the eligibility check.

### 25. Credential table purpose

Old text:

Stores the WebAuthn public key in encrypted form. Salted_PublicKey_Hash is an integrity check used to detect changes to the stored key; it is not a biometric template.

New text:

Stores the WebAuthn credential public key in encrypted form, with a salted SHA-256 integrity hash. The private signing key remains with the authenticator; no biometric sample is stored.

### 26. SimpleWebAuthn purpose

Old text:

FIDO2/WebAuthn server-side library for challenge generation and assertion verification. Implements the Roaming Identity Verification Engine (FR-02, NFR-06).

New text:

FIDO2/WebAuthn library for generating options and challenges and verifying registration and authentication responses, including user verification.

### 27. Crypto tool name

Old text:

CryptoJS / Node Crypto

New text:

Node.js crypto

### 28. Crypto tool purpose

Old text:

SHA-256 hashing for Ballot_Hash (FR-04) and AES-256 encryption for Encrypted_Timestamp. System-specific salt generation for biometric template non-transferability (NFR-06).

New text:

SHA-256 for Ballot_Hash and the salted public-key integrity hash; AES-256 encryption for Encrypted_Timestamp and Encrypted_PublicKey.

### 29. Playwright tool purpose

Old text:

End-to-end browser automation framework with WebAuthn virtual authenticator support. Enables cross-device biometric simulation for the Roaming Identity and Cross-Device Protocol Test (Section 3.3.3.4) without requiring physical biometric hardware in the CI pipeline.

New text:

Browser automation framework with virtual WebAuthn authenticator support. The repository includes a scenario that models passkey synchronization by copying a credential to a second virtual authenticator; no execution result or real-device synchronization is claimed.

### 30. Credential component development

Old text:

The Roaming Identity Module is developed as a self-contained Node.js service component encapsulating all WebAuthn registration and assertion verification logic. It exposes two internal interfaces: registerCredential(), which accepts a WebAuthn registration response from the client, applies the system-specific salt, hashes the public key, and writes the result to the Credential Table; and verifyAssertion(), which retrieves the stored credential, verifies the WebAuthn assertion signature, checks the SignCount increment, and returns a typed verification result to the Authentication API. This component is the primary subject of the Roaming Identity and Cross-Device Protocol Test.

New text:

The WebAuthn Credential component encapsulates registration and assertion verification. Registration verifies the authenticator response, encrypts the credential public key, and stores the credential ID, voter association, salted integrity hash and counter. Assertion verification decrypts the public key, checks its integrity hash, and verifies the challenge, origin, RP ID, user-verified flag, signature and counter before returning a result to the Authentication API.

### 31. Unit testing

Old text:

Unit Testing, implemented using Jest, targets individual functions and modules in isolation. Critical unit tests include: the BCrypt hash verification function; the SHA-256 ballot hashing function; the system-specific salt application logic; the JWT signing and expiry validation logic; and the Tenant Resolution Middleware’s schema context switching function. Each unit test is automated in the GitHub Actions CI pipeline and must pass before a pull request is eligible for code review.

New text:

Unit Testing, implemented using Jest, targets individual functions and modules in isolation. Critical unit tests include BCrypt password verification, SHA-256 ballot hashing, the credential public-key integrity check, JWT signing and expiry validation, and tenant-resolution behavior. The report contains no recorded automated test results.

### 32. System testing

Old text:

System and Acceptance Testing is conducted using Playwright’s virtual WebAuthn authenticator, which simulates the complete biometric authentication flow in a controlled browser environment without requiring physical biometric hardware. Playwright’s cross-browser and cross-device emulation capabilities enable the Roaming Identity and Cross-Device Protocol Test — defined in Section 3.3.3.4 — to be executed programmatically across simulated Device A and Device B contexts, verifying the enrollment-on-one-device, authentication-on-another-device scenario and the rejection of a non-registered biometric.

New text:

The repository contains a Playwright scenario that models a passkey copied to a second virtual authenticator in an isolated browser context. This simulates passkey synchronization; it does not test synchronization across physical devices. No recorded execution result is reported, so cross-device authentication is not claimed as tested.

### 33. Section 4.5 credential store

Old text:

The Encrypted Biometric Template Store is deployed as a dedicated, access-controlled storage service within the same cloud environment, isolated from the application database by a separate network policy. Access to the template store is restricted to the Roaming Identity Module’s service account, enforced by cloud IAM policies. This architectural isolation ensures that a compromise of the application database does not simultaneously expose the biometric template store, maintaining the defence-in-depth principle underlying the CIA Triad Security Pillar.

New text:

The Credential table is stored within each institution's tenant schema. It contains CredentialID, VoterID, Salted_PublicKey_Hash, Encrypted_PublicKey, SignCount, CreatedAt and LastUsedAt. The public key is encrypted with AES-256 and its salted SHA-256 hash is used as an integrity check. The private signing key remains with the authenticator, and UniVote does not store biometric samples.

### 34. Chapter 4 identity summary

Old text:

The WebAuthn Roaming Identity flow represents the most technically sophisticated component of the system, implementing FR-02 and NFR-06 through a cryptographic chain that spans device-side biometric sensing, server-side assertion verification, salted public key hash comparison, and SignCount-based clone detection. This design eliminates both the Password-Sharing and Device-Dependency flaws identified in Section 3.4 without requiring any dedicated biometric hardware beyond what students already carry.

New text:

The WebAuthn credential flow implements FR-02, NFR-02 and NFR-06. The authenticator performs user verification locally, while the server checks the signed response, challenge, expected origin and RP ID, user-verified flag, stored-key integrity and signature counter. Cross-device availability depends on passkey synchronization or separate provisioning and was not evaluated.

### 35. Chapter 4 summary close

Old text:

The core database schema — Tenant, Voter, Credential, and Ballot tables — implements the data isolation, identity assurance, and ballot integrity requirements of FR-01 through FR-04 in a design where no single table join can link a specific vote back to the voter who cast it, preserving ballot anonymity as required by the Confidentiality component of the CIA Triad. The development toolchain, centred on Playwright’s virtual WebAuthn authenticator and Jest’s unit test suite, provides a fully automated verification pipeline aligned with the V-Model structure established in Chapter Three. Chapter Five will present the results of executing this system through the defined test protocols and discuss the findings in the context of the research objectives.

New text:

The core database schema — Tenant, Voter, Credential, and Ballot — implements the data-isolation, identity-assurance and ballot-integrity requirements of FR-01 through FR-04. The Credential record contains WebAuthn credential data rather than biometric samples. Chapter Five presents the recorded local manual evaluation and distinguishes it from automated test specifications for which no execution results were available.

### 36. Authenticator table detail

Old text:

WebAuthn user verification was tried with fingerprint, face unlock and device PIN (device or model not recorded; the methods were not necessarily all tried on the same device)

New text:

WebAuthn user verification was tried with fingerprint, face unlock and device PIN (device or model not recorded; the methods were not necessarily all tried on the same device)

### 37. Manual result table detail

Old text:

Login and credential enrolment completed; fingerprint, face unlock and PIN were tried.

New text:

Login and credential enrolment completed using WebAuthn user verification; fingerprint, face unlock and PIN were tried.

### 38. Table 8 design mechanism

Old text:

WebAuthn passkey enrolment and authentication using the device authenticator

New text:

WebAuthn registration and authentication; the client options require user verification and the server verifier requires the user-verified flag.

### 39. Table 8 evaluation result

Old text:

Credential registration and vote casting by the enrolled student (Table 7, WebAuthn enrolment and cast vote scenarios)

New text:

Credential registration and vote casting by the enrolled student (Table 7). The code-review check of the user-verified flag was not a separate evaluation scenario.

### 40. Table 8 extent

Old text:

Happy path on one device. Cross-device use and rejection of an unregistered authenticator were not tested

New text:

Happy path on one device. Code inspection confirmed the user-verification request and server check, but no negative test for a missing user-verified flag was reported. Cross-device authentication was not tested.

### 41. Table 10 target

Old text:

Salted one-way hash of a biometric template stored in encrypted cloud storage

New text:

Local user verification with no raw biometric data stored or processed; credential data protected so a database disclosure alone does not provide an authenticator signing key.

### 42. Table 10 status

Old text:

Implemented differently. The final design uses WebAuthn, so no biometric template is created or stored by UniVote (Section 5.4.3)

New text:

Code inspection confirms required WebAuthn user verification and encrypted public-key storage with a salted integrity hash. No separate missing-UV or database-disclosure test was reported.

### 43. 5.4.1 Objective iii

Old text:

Objective (iii) was identity assurance through device-native authentication. The student registered a credential and later voted, which shows that the WebAuthn enrolment and authentication path worked in the evaluated environment. How this differs from the proposal is explained in Section 5.4.3.

New text:

Objective (iii) was identity assurance through device-native authentication. The manual walkthrough completed WebAuthn credential registration and voting on one device, providing evidence of the legitimate-user path. Code inspection confirmed that registration and authentication options require user verification and that the server verifier rejects responses without the user-verified flag. This is a code-review finding; the evaluation did not separately test the missing-flag case or cross-device authentication.

### 44. 5.4.3 proposal comparison

Old text:

Chapter Three (FR-02, NFR-02 and NFR-06) described a roaming biometric identity in which a salted, one-way hash of a voter’s biometric signature would be computed on the device and stored as a template in encrypted cloud storage. The implemented system instead uses the Web Authentication (WebAuthn) standard. The device authenticator verifies the user locally, using a fingerprint, face recognition or another supported method such as a device PIN, and the server verifies a cryptographic response against a registered credential. UniVote does not receive, create or store a fingerprint or face template. It stores credential information, including the public key in encrypted form and a salted integrity hash.

New text:

The proposal's FR-02, NFR-02 and NFR-06 described hashing a biometric signature on the device and keeping the result in encrypted cloud storage. The implemented system instead uses WebAuthn: the authenticator performs user verification locally (biometric or device PIN) and returns a cryptographic response for server verification against a registered credential. Each tenant's Credential record holds CredentialID, VoterID, a salted SHA-256 integrity hash for the public key, an AES-256-encrypted public key, SignCount, CreatedAt and LastUsedAt. UniVote receives and stores no biometric sample.

### 45. 5.4.3 code findings

Old text:

This is a change from the wording of the proposal, and it is reported here as such. The change is a deliberate design choice that is more privacy-preserving than the original, because it removes the need to hold any biometric-derived data centrally and so removes the risk of such data being exposed in a breach. It still meets the intent of Objective (iii), which is to ensure that the person voting is the authorised account holder, because the authenticator must verify the user before it signs the server's challenge. It also follows the device-native approach described in Section 2.4.

New text:

Code inspection confirms that registration and authentication options request user verification and that the server-side WebAuthn verifiers reject responses without the user-verified flag. The manual evaluation completed the supported user-verification path, but it did not separately test rejection of a response with the flag unset. This is a code-review finding, not an end-to-end security test.

### 46. 5.4.3 cross-device caveat

Old text:

Two consequences should be noted. First, the “roaming” behaviour in Chapter Three, in which a voter enrols once and authenticates on any compatible device, depends in the WebAuthn model on how the user’s credentials are held, for example whether a passkey is synchronised across the user’s devices or a separate security key is used. The cross-device test described in Section 3.3.3.4 was not carried out in this evaluation, so cross-device authentication is not claimed as a result. Second, a device PIN may be accepted by some authenticators as the verification method (fingerprint, face unlock and PIN were each tried during the evaluation, although not necessarily on the same device), so the guarantee is that the device’s user verification succeeded, not that a particular biometric was used.

New text:

The proposal's use of roaming referred to cross-device authentication. In WebAuthn, a passkey may be available on multiple devices if synchronized by its provider, or a credential may be provisioned separately. The repository contains a virtual-authenticator simulation, but no recorded result is reported and real-device passkey synchronization was not tested. A device PIN may satisfy user verification, so the system cannot establish that a biometric was used.

### 47. 6.2 Objective iii

Old text:

Objective (iii) was to provide identity assurance through device-native authentication. The implemented system uses WebAuthn, through which the device authenticator verifies the user locally and the server validates a cryptographic response. The evaluation recorded attempts using fingerprint, face unlock and device PIN verification, though not necessarily on the same device. Credential enrolment and voting worked in the evaluated environment; cross-device use was not tested.

New text:

Objective (iii) was to provide identity assurance through device-native authentication. The implemented system uses WebAuthn: the authenticator verifies the user locally (biometric or device PIN), and the server validates a cryptographic response against the registered credential. The manual walkthrough completed enrolment and voting on one device. Code inspection confirmed the required user-verification option and server-side flag check; the evaluation did not separately test the missing-flag case or cross-device authentication.

### 48. 6.4 contribution

Old text:

•A WebAuthn-based approach to identity assurance that does not require UniVote to receive or store fingerprint or face templates.

New text:

A WebAuthn-based approach to identity assurance that performs user verification locally and does not require UniVote to receive or store raw biometric data.

### 49. 6.5 previous proposal

Old text:

The default voter-access workflow relies on the School Admin-managed voter roll and the local active status of each account. Although the repository contains optional external roster import and status-check code, the report does not demonstrate that a live institutional service was configured or evaluated. The proposal also described a roaming biometric-template design and a user-acceptance programme; the implemented authentication uses WebAuthn, and the planned user-acceptance programme was not carried out.

New text:

The default voter-access workflow relies on the School Admin-managed voter roll and the local active status of each account. Although the repository contains optional external roster import and status-check code, the report does not demonstrate that a live institutional service was configured or evaluated. The proposal described storing biometric-derived data, whereas the implementation uses WebAuthn credentials; the planned user-acceptance programme was not carried out.

### 50. Table 8 requirement label

Old text:

NFR-02, NFR-06 Biometric privacy and salting

New text:

NFR-02, NFR-06 User-verification privacy and credential protection

### 51. 5.4.3 heading

Old text:

5.4.3 Biometric Design: Proposal Versus Implementation53

New text:

5.4.3 WebAuthn Design: Proposal Versus Implementation53

### 52. 5.4.3 heading

Old text:

5.4.3 Biometric Design: Proposal Versus Implementation

New text:

5.4.3 WebAuthn Design: Proposal Versus Implementation

### 53. Chapter 3 methodology

Old text:

The V-Model was chosen over the Waterfall methodology for a specific and deliberate reason: UniVote is a security-critical system operating in a live electoral context, where the cost of a defect discovered late in development — particularly one affecting the Biometric MFA module, the JWT session management layer, or the Schema-per-Tenant data isolation logic — is disproportionately high. In a Waterfall process, testing occurs only after all development is complete, creating a significant risk that fundamental architectural flaws are discovered only when reversal is expensive. The V-Model eliminates this risk by mandating that unit tests, integration tests, and system acceptance criteria are defined at the moment each corresponding design decision is made.

New text:

The V-Model was chosen over the Waterfall methodology for a specific and deliberate reason: UniVote is a security-critical system operating in a live electoral context, where the cost of a defect discovered late in development — particularly one affecting the WebAuthn credential-verification component, the JWT session management layer, or the Schema-per-Tenant data isolation logic — is disproportionately high. In a Waterfall process, testing occurs only after all development is complete, creating a significant risk that fundamental architectural flaws are discovered only when reversal is expensive. The V-Model eliminates this risk by mandating that unit tests, integration tests, and system acceptance criteria are defined at the moment each corresponding design decision is made.

### 54. Chapter 4 terminology

Old text:

The design decisions documented herein are governed by two overarching principles derived from the V-Model methodology adopted in Chapter Three. First, every architectural component must be directly traceable to a functional or non-functional requirement; no design element is introduced without a corresponding specification justification. Second, every component identified in the System Design phase has a pre-defined verification activity — unit test, integration test, or user acceptance test — defined in Section 3.3.3.4. This chapter is organised as follows: Section 4.2 presents the three-tier architectural design; Section 4.3 covers software design including the WebAuthn Biometric Handshake flow and component models; Section 4.4 specifies the development toolchain and testing strategy; Section 4.5 addresses deployment; and Section 4.6 provides a summary.

New text:

The design decisions documented herein are governed by two overarching principles derived from the V-Model methodology adopted in Chapter Three. First, every architectural component must be directly traceable to a functional or non-functional requirement; no design element is introduced without a corresponding specification justification. Second, every component identified in the System Design phase has a pre-defined verification activity — unit test, integration test, or user acceptance test — defined in Section 3.3.3.4. This chapter is organised as follows: Section 4.2 presents the three-tier architectural design; Section 4.3 covers software design including the WebAuthn registration and authentication flow and component models; Section 4.4 specifies the development toolchain and testing strategy; Section 4.5 addresses deployment; and Section 4.6 provides a summary.

### 55. 5.4.6 limitation

Old text:

•The automated test suites in the repository have no recorded results in this report.

New text:

•The automated test suites in the repository have no recorded results in this report. User verification may be satisfied by a device PIN, so UniVote cannot prove a biometric was used; synchronised passkeys may exist on more than one of a user's devices; cross-device authentication was not tested.

### 56. 6.5 limitation

Old text:

The limitations discussed in Section 5.4.6 also apply to the conclusions in this chapter. The evaluation consisted of one manual run in a local environment with one voter. It was not an independent evaluation and did not include adversarial, load, usability or accessibility testing. The repository's automated test suites had no recorded results in the report. 

New text:

The limitations discussed in Section 5.4.6 also apply to the conclusions in this chapter. The evaluation consisted of one manual run in a local environment with one voter. It was not an independent evaluation and did not include adversarial, load, usability or accessibility testing. The repository's automated test suites had no recorded results in the report.  User verification may be satisfied by a device PIN, so UniVote cannot prove a biometric was used; synchronised passkeys may exist on more than one of a user's devices; cross-device authentication was not tested.

### Figure artwork

- Figure 1 keeps the conceptual-framework layout and replaces the claim of biometric verification with WebAuthn device user verification.
- Figure 2 replaces the separate biometric-data store with a WebAuthn verifier and tenant credential records.
- Figure 3 changes the use case to WebAuthn credential registration.
- Figure 4 retains its figure slot and number but now shows the implemented login, WebAuthn challenge, local user verification, server checks, credential data and ballot-token sequence.

## Decision / consistency note

c.md names FR-03 for identity assurance, but the source document assigns FR-02 to identity assurance and FR-03 to JWT session management. Existing identifiers were preserved: FR-02 was updated and FR-03 was left as the JWT requirement.
