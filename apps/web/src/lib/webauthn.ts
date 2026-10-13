// Wraps @simplewebauthn/browser to translate low-level WebAuthn/DOMException
// failures into friendly, user-facing error messages.
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
// @simplewebauthn/browser re-exports only its functions; the JSON option/
// response shapes it consumes live in the shared @simplewebauthn/types
// package (a transitive dependency, hoisted to the workspace root).
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';

export class WebAuthnClientError extends Error {}

export async function registerBiometricCredential(
  options: PublicKeyCredentialCreationOptionsJSON
): Promise<RegistrationResponseJSON> {
  try {
    return await startRegistration(options);
  } catch (err) {
    throw new WebAuthnClientError(friendlyMessage(err, 'register'));
  }
}

export async function authenticateBiometricCredential(
  options: PublicKeyCredentialRequestOptionsJSON
): Promise<AuthenticationResponseJSON> {
  try {
    return await startAuthentication(options);
  } catch (err) {
    throw new WebAuthnClientError(friendlyMessage(err, 'authenticate'));
  }
}

function friendlyMessage(err: unknown, action: 'register' | 'authenticate'): string {
  if (err instanceof Error) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'The biometric prompt was cancelled or timed out. Please try again.';
      case 'InvalidStateError':
        return 'A biometric credential is already registered on this device.';
      case 'NotSupportedError':
        return 'This device or browser does not support biometric authentication.';
      case 'SecurityError':
        return 'Biometric authentication is not available on this connection (HTTPS is required).';
      default:
        return err.message || `Failed to ${action} with your biometric credential.`;
    }
  }
  return `Failed to ${action} with your biometric credential.`;
}
