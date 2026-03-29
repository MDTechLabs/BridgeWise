import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class WebhookSignatureService {
  private static readonly ALGORITHM = 'sha256';
  private static readonly HEADER_PREFIX = 'sha256=';

  /**
   * Generates an HMAC-SHA256 signature for the given payload using the secret.
   * Signature format:  sha256=<hex-digest>
   */
  sign(payload: string, secret: string): string {
    const digest = createHmac(WebhookSignatureService.ALGORITHM, secret)
      .update(payload, 'utf8')
      .digest('hex');

    return `${WebhookSignatureService.HEADER_PREFIX}${digest}`;
  }

  /**
   * Constant-time comparison to prevent timing attacks.
   */
  verify(payload: string, secret: string, signature: string): boolean {
    const expected = this.sign(payload, secret);

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      // Buffers differ in length → not equal
      return false;
    }
  }
}
