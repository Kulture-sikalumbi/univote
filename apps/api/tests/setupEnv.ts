// tests/setupEnv.ts — loaded by Jest before any test file, so crypto/JWT
// modules that read process.env at call-time always have safe test values.
process.env.JWT_SECRET ??= 'test_secret_do_not_use_in_prod';
process.env.AES_KEY ??= '0'.repeat(64);
process.env.UNIVOTE_BIOMETRIC_SALT ??= 'test_salt';
process.env.RP_ID ??= 'univote.test';
process.env.ORIGIN ??= 'https://zut.univote.test';
process.env.NODE_ENV ??= 'test';
