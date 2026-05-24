import { createHash, createDecipheriv } from 'node:crypto';

/**
 * 飞书事件回调安全相关：签名校验 + Encrypt 解密
 *
 * 文档：
 * - 签名: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case
 * - 解密: 同上
 */

/**
 * 校验飞书事件签名。
 *
 * 算法：sha256(timestamp + nonce + encryptKey + rawBody) → hex
 *
 * 注意：
 * - 飞书后台**配置了 Encrypt Key** 时才会下发签名 header；如果只配了 Verification Token 而没配 Encrypt Key，请求不会带签名。
 * - 因此调用方应只在 encryptKey 非空时启用签名校验。
 *
 * @param rawBody 请求的原始 body 字符串（必须是原始字节，不能是 reparse 后的 JSON）
 * @param timestamp X-Lark-Request-Timestamp header
 * @param nonce X-Lark-Request-Nonce header
 * @param signature X-Lark-Signature header
 * @param encryptKey 飞书后台配置的 Encrypt Key
 */
export function verifySignature(
  rawBody: string,
  timestamp: string,
  nonce: string,
  signature: string,
  encryptKey: string,
): boolean {
  if (!encryptKey) return false;
  if (!timestamp || !nonce || !signature) return false;

  const content = timestamp + nonce + encryptKey + rawBody;
  const expected = createHash('sha256').update(content, 'utf8').digest('hex');

  // 长度不同直接 false，避免 timingSafeEqual 抛错
  if (expected.length !== signature.length) return false;

  // 简单等值比较即可——signature 来自外部已知长度的 hex，timing 攻击在此场景下风险极低
  return expected === signature;
}

/**
 * AES-256-CBC 解密飞书事件 encrypt 字段。
 *
 * 算法：
 *   key = SHA-256(encryptKey)             // 32 bytes
 *   data = base64_decode(encrypt)
 *   iv = data[:16]
 *   cipher = data[16:]
 *   plain = AES-256-CBC.decrypt(cipher, key, iv) ，PKCS7 padding
 *
 * 解密后的 plaintext 是 JSON 字符串，再 JSON.parse 拿到完整事件 payload。
 *
 * @returns 解密后的 JSON 字符串
 * @throws 如果解密失败（key 错、cipher 被篡改等）
 */
export function decryptEvent(encrypt: string, encryptKey: string): string {
  if (!encryptKey) {
    throw new Error('Cannot decrypt: FEISHU_ENCRYPT_KEY is not configured');
  }

  const key = createHash('sha256').update(encryptKey, 'utf8').digest(); // 32 bytes Buffer
  const data = Buffer.from(encrypt, 'base64');

  if (data.length < 16) {
    throw new Error('Invalid encrypt payload: too short');
  }

  const iv = data.subarray(0, 16);
  const ciphertext = data.subarray(16);

  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  // node 默认自动去 PKCS7 padding
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plain.toString('utf8');
}
