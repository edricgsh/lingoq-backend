import { EncryptionUtil } from 'src/shared/utils/encryption.util';

export class EncryptedFieldTransformer {
  static getTransformer() {
    return {
      to: (value: string): string => {
        if (!value) return value;
        return EncryptionUtil.encrypt(value);
      },
      from: (value: string): string => {
        if (!value) return value;
        return EncryptionUtil.decrypt(value);
      },
    };
  }
}
