import { test, expect, type BrowserContext, type CDPSession } from '@playwright/test';

test('SIS voter changes the temporary password, enrolls a passkey, and votes from a second device', async ({ browser }) => {
  test.skip(
    process.env.E2E_RUN_FULL_FLOW !== 'true',
    'Seed a disposable test database, start the API and web dev servers, then set E2E_RUN_FULL_FLOW=true.'
  );

  const webBaseURL = process.env.E2E_WEB_BASE_URL ?? 'http://localhost:5173';
  const adminUsername = 'e2e-admin';
  const adminPassword = 'E2E_Admin_Pass_123!';
  const studentID = 'STU-ACTIVE-1';
  const tenantCode = process.env.E2E_TENANT_CODE;
  const studentPassword = process.env.E2E_STUDENT_NEW_PASSWORD ?? 'E2E_Student_Pass_123!';
  const contextA = await browser.newContext();
  let contextB: BrowserContext | undefined;

  test.skip(!tenantCode, 'Set E2E_TENANT_CODE to the code printed by the E2E seed command.');

  try {
    const pageA = await contextA.newPage();
    const authenticatorA = await addPlatformAuthenticator(contextA, pageA);

    // Import voters from the local SIS mock and capture the one-time password.
    await pageA.goto(webBaseURL);
    await pageA.getByRole('button', { name: 'School Admin' }).click();
    await pageA.getByLabel('Institution code').fill(tenantCode!);
    await pageA.getByLabel('Username').fill(adminUsername);
    await pageA.getByLabel('Password').fill(adminPassword);
    await pageA.getByRole('button', { name: 'Log in' }).click();
    await pageA.getByRole('button', { name: 'Voters' }).click();
    await pageA.getByLabel('Roster API base URL').fill('http://localhost:3001/mock-sis');
    await pageA.getByLabel('API key').fill('dev-key');
    await pageA.getByRole('button', { name: 'Save SIS settings' }).click();
    await pageA.getByRole('button', { name: 'Import voter roster' }).click();

    const importedVoter = pageA.getByTestId('temporary-passwords').getByRole('row').filter({ hasText: studentID });
    await expect(importedVoter).toBeVisible();
    const temporaryPassword = (await importedVoter.locator('td').nth(1).innerText()).trim();
    expect(temporaryPassword).not.toBe('');

    // First login requires a permanent password, then biometric enrollment.
    await pageA.getByRole('button', { name: 'Log out' }).click();
    await pageA.getByLabel('Institution code').fill(tenantCode!);
    await pageA.getByLabel('Student ID').fill(studentID);
    await pageA.getByLabel('Password').fill(temporaryPassword);
    await pageA.getByRole('button', { name: 'Log in' }).click();
    await pageA.getByLabel('New password').fill(studentPassword);
    await pageA.getByLabel('Confirm new password').fill(studentPassword);
    await pageA.getByRole('button', { name: 'Save password' }).click();
    await pageA.getByRole('button', { name: 'Continue with biometric setup' }).click();
    await expect(pageA.getByText('E2E Candidate')).toBeVisible({ timeout: 15_000 });

    // Copy the virtual passkey into a separate device authenticator, simulating
    // passkey sync while keeping the browser contexts isolated.
    const credentials = await authenticatorA.session.send('WebAuthn.getCredentials', {
      authenticatorId: authenticatorA.id,
    });
    expect(credentials.credentials).toHaveLength(1);

    contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    const authenticatorB = await addPlatformAuthenticator(contextB, pageB);
    await authenticatorB.session.send('WebAuthn.addCredential', {
      authenticatorId: authenticatorB.id,
      credential: credentials.credentials[0],
    });

    await pageB.goto(webBaseURL);
    await pageB.getByLabel('Institution code').fill(tenantCode!);
    await pageB.getByLabel('Student ID').fill(studentID);
    await pageB.getByLabel('Password').fill(studentPassword);
    await pageB.getByRole('button', { name: 'Log in' }).click();
    await expect(pageB.getByText('E2E Candidate')).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole('radio').first().check();
    await pageB.getByRole('button', { name: 'Review & confirm' }).click();
    await pageB.getByRole('button', { name: 'Confirm & cast vote' }).click();
    await expect(pageB.getByRole('heading', { name: 'Vote recorded' })).toBeVisible();

    // A fresh session for the same voter must stop at the already-voted gate.
    await pageB.getByRole('button', { name: 'Log out' }).click();
    await pageB.getByLabel('Student ID').fill(studentID);
    await pageB.getByLabel('Password').fill(studentPassword);
    await pageB.getByRole('button', { name: 'Log in' }).click();
    await expect(pageB.getByText(/already cast your vote/i)).toBeVisible({ timeout: 15_000 });
  } finally {
    await contextB?.close();
    await contextA.close();
  }
});

async function addPlatformAuthenticator(
  context: BrowserContext,
  page: import('@playwright/test').Page
): Promise<{ id: string; session: CDPSession }> {
  const session = await context.newCDPSession(page);
  await session.send('WebAuthn.enable');
  const result = await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { id: result.authenticatorId, session };
}
