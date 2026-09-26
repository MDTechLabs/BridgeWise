import { StellarProviderReputationService } from './reputation.service';

describe('StellarProviderReputationService', () => {
  let service: StellarProviderReputationService;

  beforeEach(() => {
    service = new StellarProviderReputationService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate reputation score', () => {
    const score = service.calculateReputationScore('provider-1');
    expect(score.providerId).toEqual('provider-1');
    expect(score.score).toBeDefined();
  });
});
