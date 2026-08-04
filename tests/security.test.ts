import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../lib/security/encryption';

describe('Security, Token Encryption & Key Audit Test Suite', () => {
  it('should encrypt and decrypt Meta Graph access tokens correctly using AES-256-GCM', () => {
    const rawToken = 'EAABwz1234567890_meta_long_lived_graph_api_access_token_secret_ghent';
    const encrypted = encryptToken(rawToken);

    expect(encrypted).not.toBe(rawToken);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3); // iv:authTag:encrypted
    expect(parts[0].length).toBe(24); // 12-byte IV in hex = 24 chars

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(rawToken);
  });

  it('should generate a unique random IV for every encryption call', () => {
    const rawToken = 'same_meta_token_secret';
    const encrypted1 = encryptToken(rawToken);
    const encrypted2 = encryptToken(rawToken);

    expect(encrypted1).not.toBe(encrypted2);
    expect(encrypted1.split(':')[0]).not.toBe(encrypted2.split(':')[0]);
  });

  it('should fail decryption if ciphertext or auth tag is tampered with', () => {
    const rawToken = 'secret_token_123';
    const encrypted = encryptToken(rawToken);
    const parts = encrypted.split(':');

    // Tamper with the encrypted ciphertext
    const tamperedCiphertext = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -2) + 'ab';
    expect(() => decryptToken(tamperedCiphertext)).toThrow();

    // Tamper with auth tag
    const tamperedAuthTag = parts[0] + ':00000000000000000000000000000000:' + parts[2];
    expect(() => decryptToken(tamperedAuthTag)).toThrow();
  });

  it('should throw error on invalid ciphertext string structure', () => {
    expect(() => decryptToken('invalid_encrypted_data')).toThrow();
  });
});
