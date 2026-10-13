import { test, expect, request } from '@playwright/test';

test('a ballot token is single-use', async () => {
  const ballotToken = process.env.E2E_TEST_BALLOT_TOKEN;
  const electionID = process.env.E2E_TEST_ELECTION_ID;
  const candidateID = process.env.E2E_TEST_CANDIDATE_ID;
  const tenantCode = process.env.E2E_TENANT_CODE;
  test.skip(
    !ballotToken || !electionID || !candidateID || !tenantCode,
    'Requires a fresh ballot token, election, candidate, and institution code from a disposable test fixture.'
  );

  const api = await request.newContext({ baseURL: process.env.E2E_API_BASE_URL ?? 'http://localhost:3001' });
  const options = {
    headers: { 'X-Tenant-Code': tenantCode!, Authorization: `Bearer ${ballotToken}` },
    data: { candidateID },
  };

  try {
    const first = await api.post(`/api/v1/ballot/${electionID}/cast`, options);
    expect(first.status()).toBe(201);

    const second = await api.post(`/api/v1/ballot/${electionID}/cast`, options);
    expect(second.status()).toBe(401);
    await expect(second.json()).resolves.toMatchObject({ error: 'Ballot token already used' });
  } finally {
    await api.dispose();
  }
});
