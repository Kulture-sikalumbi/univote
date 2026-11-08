TASK 2: Make the WebAuthn / biometric claims accurate in the code check and in the report.

START FROM the latest edited files from Task 1 (the objective (ii) removal). Work on NEW copies
named *_V2.docx. Never overwrite earlier files. Use tracked changes if possible; otherwise write a
changelog. Preserve all formatting, tables, numbering and images.

BACKGROUND
UniVote uses WebAuthn passkeys. The device authenticator performs local user verification
(fingerprint, face unlock or device PIN) and the server verifies a cryptographic response.
UniVote stores no fingerprint or face template. The server stores WebAuthn credential data
(public key stored encrypted, plus a salted integrity hash). The original proposal (Chapter 3)
described a stored, salted biometric hash. That is technically unsound (biometric samples never
match exactly, so they cannot be salted and hashed like passwords) and the system does not do it.
The report must describe the real design. The system must not be redesigned.

PART A: CODE CHECK (read the repo first; report before changing anything)
Inspect the WebAuthn registration and authentication code and report, with file names and line
numbers, what it does for each item:
 1. userVerification is "required" at registration options and at authentication options.
 2. The server checks the UV (user verified) flag in the authenticator data when verifying a login
    and a registration, and rejects when it is not set.
 3. Each challenge is random, single-use, short-lived and bound to the user/session.
 4. The expected origin and RP ID are enforced.
 5. The signature counter is checked/updated if the library supports it.
 6. Which credential fields are stored, and which are encrypted or hashed.
Rules for this part:
 - If an item is already correct, change nothing.
 - If item 1 or 2 is missing, apply the smallest possible fix, add or update a test for it, and
   show me the diff. Do not refactor anything else. Do not touch unrelated code.
 - For items 3 to 6, only report. Do not change them without my approval.
 - Do not run integration or e2e tests against any database that holds real data. Use a disposable
   test database only. If unsure, ask.

PART B: DOCUMENT CHANGES (match what the code actually does, as found in Part A)
Voice: impersonal academic prose matching Chapters 1 to 3. No first person. Never mention "the
author", AI, agents or this task. Do not invent results or citations.

1. Chapter 3, FR-03, NFR-02, NFR-06 and any summary list: replace the stored salted biometric
   hash wording. Draft replacements (adjust to the code):
   - FR-03: "The system shall verify voter identity at login and at voting using WebAuthn,
     requiring device-native user verification (biometric or device PIN) before a cryptographic
     response is accepted."
   - NFR-02: "The system shall not store or process raw biometric data. User verification shall be
     performed locally by the voter's authenticator."
   - NFR-06: "Credential data held by the system shall be protected so that a database leak does not
     allow a credential to be used to authenticate."
2. Chapter 4 (4.5 and wherever else): remove "Encrypted Biometric Template Store" and any storage
   of biometric templates. Describe the WebAuthn credential store instead (fields found in Part A).
3. Chapters 1 to 4: search "biometric", "fingerprint", "facial", "template", "roaming", "salted".
   Where the claim is stronger than the system, change to "device-native user verification
   (biometric or device PIN)". Where "roaming" is used, explain it as passkey synchronisation or
   cross-device passkey authentication, and do not claim it was tested. Keep the wording consistent
   with the objective (now objective (iii)).
4. Chapter 5: update 5.4.3 so it states the change from the proposal once, plainly. Remove duplicate
   explanations. Add the Part A findings (UV required or not, server UV check) to Table 8 and 5.4.1
   only if they were verified in code. Do not claim they were tested end to end.
5. Chapter 6: update 6.2 (objective iii) and 6.6 if needed to match.
6. Add to the limitations (5.4.6 and 6.5), in one sentence each: user verification may be satisfied
   by a device PIN, so UniVote cannot prove a biometric was used; synchronised passkeys may exist on
   more than one of a user's devices; cross-device authentication was not tested.

OUTPUT
 (a) Part A findings table: item, status (correct / fixed / needs decision), file:line.
 (b) Diffs for any code changed, and the tests added.
 (c) The edited documents and a changelog (section, old text, new text).
 (d) Items I must decide or check, including any sentence you were unsure of.
 (e) Proof of consistency: a final search of all edited files for "biometric template",
     "salted hash of", "Encrypted Biometric" and "roaming biometric" showing zero unexplained matches.