import crypto from 'crypto';

export class PKCEUtils {
  static generateVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  static generateChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest().toString('base64url');
  }
}
