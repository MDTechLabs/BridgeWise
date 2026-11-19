import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceDriftClassifier } from './balance-drift.classifier';
import { BalanceDriftRecord } from './balance-drift.entity';

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

describe('BalanceDriftClassifier', () => {
  let classifier: BalanceDriftClassifier;
  let repository: jest.Mocked<Repository<BalanceDriftRecord>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceDriftClassifier,
        {
          provide: getRepositoryToken(BalanceDriftRecord),
          useFactory: mockRepository,
        },
      ],
    }).compile();

    classifier = module.get(BalanceDriftClassifier);
    repository = module.get(getRepositoryToken(BalanceDriftRecord));
  });

  it('classifies normal drift when below warning threshold', () => {
    const result = classifier.classify(
      {
        chainId: 'stellar-testnet',
        contractAddress: 'CABC...',
        asset: 'USDC',
        expectedBalance: '1000000',
        observedBalance: '1000500',
      },
      { warning: '10000', critical: '50000' },
    );

    expect(result.severity).toBe('normal');
    expect(result.direction).toBe('surplus');
    expect(result.driftAmount).toBe('500');
  });

  it('classifies warning drift when above warning but below critical', () => {
    const result = classifier.classify(
      {
        chainId: 'stellar-testnet',
        contractAddress: 'CABC...',
        asset: 'USDC',
        expectedBalance: '1000000',
        observedBalance: '1020000',
      },
      { warning: '10000', critical: '50000' },
    );

    expect(result.severity).toBe('warning');
    expect(result.direction).toBe('surplus');
    expect(result.driftAmount).toBe('20000');
  });

  it('classifies critical drift when above critical threshold', () => {
    const result = classifier.classify(
      {
        chainId: 'stellar-testnet',
        contractAddress: 'CABC...',
        asset: 'USDC',
        expectedBalance: '1000000',
        observedBalance: '1100000',
      },
      { warning: '10000', critical: '50000' },
    );

    expect(result.severity).toBe('critical');
    expect(result.direction).toBe('surplus');
    expect(result.driftAmount).toBe('100000');
  });

  it('classifies deficit direction when observed below expected', () => {
    const result = classifier.classify(
      {
        chainId: 'stellar-testnet',
        contractAddress: 'CABC...',
        asset: 'USDC',
        expectedBalance: '1000000',
        observedBalance: '950000',
      },
      { warning: '10000', critical: '50000' },
    );

    expect(result.direction).toBe('deficit');
    expect(result.driftAmount).toBe('-50000');
    expect(result.severity).toBe('critical');
  });

  it('classifies none direction when balances match exactly', () => {
    const result = classifier.classify(
      {
        chainId: 'stellar-testnet',
        contractAddress: 'CABC...',
        asset: 'USDC',
        expectedBalance: '1000000',
        observedBalance: '1000000',
      },
      { warning: '10000', critical: '50000' },
    );

    expect(result.direction).toBe('none');
    expect(result.driftAmount).toBe('0');
    expect(result.severity).toBe('normal');
  });

  it('persists record on classifyAndRecord', async () => {
    const snapshot = {
      chainId: 'stellar-testnet',
      contractAddress: 'CABC...',
      asset: 'USDC',
      expectedBalance: '1000000',
      observedBalance: '1000500',
    };

    repository.create.mockReturnValue({ id: 'test-id', ...snapshot });
    repository.save.mockResolvedValue({ id: 'test-id', ...snapshot });

    const result = await classifier.classifyAndRecord(snapshot);

    expect(repository.create).toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
    expect(result.severity).toBe('normal');
  });

  it('uses default thresholds when none provided', () => {
    const result = classifier.classify(
      {
        chainId: 'stellar-testnet',
        contractAddress: 'CABC...',
        asset: 'USDC',
        expectedBalance: '1000000',
        observedBalance: '1005000',
      },
    );

    expect(result.thresholds.warning).toBe('1000000');
    expect(result.thresholds.critical).toBe('10000000');
    expect(result.severity).toBe('warning');
  });
});