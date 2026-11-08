import crypto from 'node:crypto';
import { getPrismaForTenant } from '../../src/lib/tenantPrisma';
import { encryptData } from '../../src/crypto/encrypt';
import { hashWithSystemSalt } from '../../src/crypto/salt';
import { verifyBiometricAssertion } from '../../src/modules/auth/webauthn.service';

jest.mock('../../src/lib/tenantPrisma', () => ({ getPrismaForTenant: jest.fn() }));

describe('WebAuthn user-verification enforcement', () => {
  it('rejects an otherwise-shaped assertion whose authenticator UV flag is unset', async () => {
    const publicKeyBase64 = Buffer.from('synthetic credential public key').toString('base64');
    const credentialID = Buffer.from('synthetic-credential-id').toString('base64url');
    const database = {
      credential: {
        findFirst: jest.fn().mockResolvedValue({
          CredentialID: credentialID,
          Encrypted_PublicKey: encryptData(publicKeyBase64),
          Salted_PublicKey_Hash: await hashWithSystemSalt(publicKeyBase64),
          SignCount: 0n,
        }),
        update: jest.fn(),
      },
    };
    (getPrismaForTenant as jest.Mock).mockResolvedValue(database);

    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.get',
      challenge: 'test-challenge',
      origin: process.env.ORIGIN,
    })).toString('base64url');
    const authenticatorData = Buffer.alloc(37);
    crypto.createHash('sha256').update(process.env.RP_ID!).digest().copy(authenticatorData, 0);
    authenticatorData[32] = 0x01; // User present, but user verification (0x04) is not set.

    const response = {
      id: credentialID,
      rawId: credentialID,
      type: 'public-key',
      response: {
        clientDataJSON,
        authenticatorData: authenticatorData.toString('base64url'),
        signature: Buffer.from([1]).toString('base64url'),
        userHandle: null,
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    } as never;

    await expect(
      verifyBiometricAssertion('zut', 'voter-1', response, 'test-challenge')
    ).rejects.toThrow('User verification required, but user could not be verified');
    expect(database.credential.update).not.toHaveBeenCalled();
  });
});
