import { Test, TestingModule } from '@nestjs/testing';
import { TimelockService } from './timelock.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('TimelockService', () => {
  let service: TimelockService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimelockService],
    }).compile();

    service = module.get<TimelockService>(TimelockService);
  });

  it('should successfully veto a pending transaction', () => {
    const result = service.vetoTransaction({
      transactionId: 'tx-123',
      guardianId: 'guardian-01',
      reason: 'Suspicious activity detected'
    });
    
    expect(result.status).toBe('VETOED');
    expect(result.vetoedBy).toBe('guardian-01');
  });

  it('should throw NotFoundException if transaction does not exist', () => {
    expect(() => service.vetoTransaction({
      transactionId: 'invalid-tx',
      guardianId: 'guardian-01',
      reason: 'Test'
    })).toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if transaction is already vetoed', () => {
    service.vetoTransaction({ transactionId: 'tx-123', guardianId: 'g1', reason: 'r1' });
    
    expect(() => service.vetoTransaction({
      transactionId: 'tx-123',
      guardianId: 'g2',
      reason: 'r2'
    })).toThrow(ForbiddenException);
  });
});
