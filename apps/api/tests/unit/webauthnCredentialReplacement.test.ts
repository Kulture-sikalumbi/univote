import { getPrismaForTenant } from '../../src/lib/tenantPrisma';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { verifyAndStoreCredential } from '../../src/modules/auth/webauthn.service';

jest.mock('../../src/lib/tenantPrisma', () => ({ getPrismaForTenant: jest.fn() }));
jest.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: jest.fn(),
  generateRegistrationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
}));
jest.mock('../../src/crypto/encrypt', () => ({ encryptData: jest.fn(() => 'encrypted-key') }));
jest.mock('../../src/crypto/salt', () => ({ hashWithSystemSalt: jest.fn(() => Promise.resolve('key-hash')) }));

describe('WebAuthn credential replacement', () => {
  const transactionCredential = {
    create: jest.fn(),
    deleteMany: jest.fn(),
  };
  const database = {
    $transaction: jest.fn(async (callback: (tx: { credential: typeof transactionCredential }) => unknown) =>
      callback({ credential: transactionCredential })
    ),
    credential: { create: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaForTenant as jest.Mock).mockResolvedValue(database);
    (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      registrationInfo: {
        credentialID: Buffer.from('replacement-device'),
        credentialPublicKey: Buffer.from('public-key'),
        counter: 0,
      },
    });
  });

  it('stores the new credential before deleting prior credentials in one transaction', async () => {
    await verifyAndStoreCredential('tenant', 'voter-1', {} as never, 'challenge', true);

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ VoterID: 'voter-1' }) })
    );
    expect(transactionCredential.deleteMany).toHaveBeenCalledWith({
      where: {
        VoterID: 'voter-1',
        CredentialID: { not: Buffer.from('replacement-device').toString('base64url') },
      },
    });
  });

  it('does not delete existing credentials when storing the replacement fails', async () => {
    transactionCredential.create.mockRejectedValueOnce(new Error('database write failed'));

    await expect(
      verifyAndStoreCredential('tenant', 'voter-1', {} as never, 'challenge', true)
    ).rejects.toThrow('database write failed');

    expect(transactionCredential.deleteMany).not.toHaveBeenCalled();
  });
});
