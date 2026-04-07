import * as crypto from 'crypto';
import { AwsSecretsService } from 'src/modules/aws-secrets/aws-secrets.service';

export class EncryptionUtil {
  private static encryptionKey: Buffer;
  private static readonly algorithm = 'aes-256-cbc';
  private static readonly encryptionPrefix = 'ENC:';

  static async initialize(awsSecretsService: AwsSecretsService): Promise<void> {
    if (!this.encryptionKey) {
      const secrets = await awsSecretsService.getSecret();
      const rawKey = secrets.LINGOQ_INTERNAL_SECRET_KEY;
      if (!rawKey) {
        throw new Error('LINGOQ_INTERNAL_SECRET_KEY is not configured in secrets');
      }
      this.encryptionKey = Buffer.from(rawKey, 'hex');
      if (this.encryptionKey.length !== 32) {
        throw new Error(
          'LINGOQ_INTERNAL_SECRET_KEY must be 32 bytes (64 hex chars) for AES-256',
        );
      }
    }
  }

  static encrypt(text: string): string {
    if (!text) return text;
    if (!this.encryptionKey) {
      throw new Error('EncryptionUtil not initialized. Call initialize() first.');
    }
    if (this.isEncrypted(text)) return text;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${this.encryptionPrefix}${iv.toString('hex')}:${encrypted}`;
  }

  static decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;
    if (!this.encryptionKey) {
      throw new Error('EncryptionUtil not initialized. Call initialize() first.');
    }
    if (!this.isEncrypted(encryptedText)) return encryptedText;

    try {
      const withoutPrefix = encryptedText.substring(this.encryptionPrefix.length);
      const colonIdx = withoutPrefix.indexOf(':');
      if (colonIdx === -1) return encryptedText;

      const ivHex = withoutPrefix.substring(0, colonIdx);
      const encrypted = withoutPrefix.substring(colonIdx + 1);
      const iv = Buffer.from(ivHex, 'hex');
      if (iv.length !== 16) return encryptedText;

      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return encryptedText;
    }
  }

  static isEncrypted(value: string): boolean {
    return value?.startsWith(this.encryptionPrefix) ?? false;
  }
}
