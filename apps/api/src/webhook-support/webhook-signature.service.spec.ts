import { WebhookSignatureService } from '../webhook-signature.service';

describe('WebhookSignatureService', () => {
  let service: WebhookSignatureService;

  beforeEach(() => {
    service = new WebhookSignatureService();
  });

  describe('sign', () => {
    it('returns a sha256= prefixed hex string', () => {
      const sig = service.sign('{"event":"ping"}', 'my-secret');
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('produces deterministic output for the same inputs', () => {
      const a = service.sign('payload', 'secret');
      const b = service.sign('payload', 'secret');
      expect(a).toBe(b);
    });

    it('produces different output for different payloads', () => {
      const a = service.sign('payload-A', 'secret');
      const b = service.sign('payload-B', 'secret');
      expect(a).not.toBe(b);
    });

    it('produces different output for different secrets', () => {
      const a = service.sign('payload', 'secret-A');
      const b = service.sign('payload', 'secret-B');
      expect(a).not.toBe(b);
    });
  });

  describe('verify', () => {
    it('returns true for a valid signature', () => {
      const payload = JSON.stringify({ event: 'gas.spike_detected' });
      const secret = 'super-secret-key-16chars';
      const sig = service.sign(payload, secret);
      expect(service.verify(payload, secret, sig)).toBe(true);
    });

    it('returns false for a tampered payload', () => {
      const secret = 'super-secret-key-16chars';
      const sig = service.sign('original', secret);
      expect(service.verify('tampered', secret, sig)).toBe(false);
    });

    it('returns false for a wrong secret', () => {
      const payload = 'payload';
      const sig = service.sign(payload, 'correct-secret-16c');
      expect(service.verify(payload, 'wrong-secret-16ch', sig)).toBe(false);
    });

    it('returns false for an empty signature string', () => {
      expect(service.verify('payload', 'secret', '')).toBe(false);
    });

    it('is not vulnerable to basic timing oracle (different length strings)', () => {
      // timingSafeEqual would throw if lengths differ — verify() must not throw
      expect(() => service.verify('payload', 'secret', 'tooshort')).not.toThrow();
      expect(service.verify('payload', 'secret', 'tooshort')).toBe(false);
    });
  });
});
