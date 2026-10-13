import { test, expect, request } from '@playwright/test';

test('a ballot token cannot read its election under another institution code', async () => {
  const ballotToken = process.env.E2E_TEST_BALLOT_TOKEN;
  const tokenElectionID = process.env.E2E_TEST_ELECTION_ID;
  const otherTenantCode = process.env.E2E_CROSS_TENANT_CODE;
  test.skip(
    !ballotToken || !tokenElectionID || !otherTenantCode,
    'Requires a valid test ballot token, its election ID, and a second institution code.'
  );

  const api = await request.newContext({ baseURL: process.env.E2E_API_BASE_URL ?? 'http://localhost:3001' });
  try {
    const response = await api.get(`/api/v1/ballot/${tokenElectionID}`, {
      headers: {
        'X-Tenant-Code': otherTenantCode!,
        Authorization: `Bearer ${ballotToken}`,
      },
    });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Token does not belong to this institution',
    });
  } finally {
    await api.dispose();
  }
});
