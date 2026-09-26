/**
 * Webhook HMAC signing & verification and API auth middleware helpers for BridgeWise.
 */

import * as crypto from 'crypto';

export class WebhookSecurity {
  /**
   * Signs a webhook payload string using HMAC SHA-256.
   */
  public static signPayload(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Verifies an incoming webhook HMAC signature.
   */
  public static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSig = this.signPayload(payload, secret);
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
    } catch {
      return false;
    }
  }
}

export interface AuthUser {
  id: string;
  role: 'admin' | 'operator' | 'user';
  permissions: string[];
}

export class ApiAuthMiddleware {
  public static validateToken(authHeader?: string): AuthUser | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.substring(7);
    if (!token) return null;

    // Basic token parse / mock validation helper
    return {
      id: 'usr_validated',
      role: 'operator',
      permissions: ['bridge:read', 'bridge:write'],
    };
  }

  public static hasPermission(user: AuthUser, requiredPermission: string): boolean {
    return user.role === 'admin' || user.permissions.includes(requiredPermission);
  }
}
