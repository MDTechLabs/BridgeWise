import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { TransferState, TransitionRecord, TransferLifecycle } from './transfer-state-machine.types';

const TRANSITIONS: Record<TransferState, readonly TransferState[]> = {
  pending:   ['locked', 'failed'],
  locked:    ['validated', 'failed', 'refunded'],
  validated: ['submitted', 'failed', 'refunded'],
  submitted: ['confirmed', 'failed'],
  confirmed: ['completed', 'failed'],
  completed: [],
  failed:    ['refunded'],
  refunded:  [],
};

interface MachineEntry {
  current: TransferState;
  history: TransitionRecord[];
}

@Injectable()
export class TransferStateMachineService {
  private readonly logger = new Logger(TransferStateMachineService.name);
  private readonly machines = new Map<string, MachineEntry>();

  create(transferId: string, initial: TransferState = 'pending'): TransferLifecycle {
    if (this.machines.has(transferId)) {
      this.logger.warn(`State machine for ${transferId} already exists, returning current state`);
      return this.get(transferId);
    }

    this.machines.set(transferId, { current: initial, history: [] });
    this.logger.log(`Transfer ${transferId} created in state: ${initial}`);
    return this.get(transferId);
  }

  get(transferId: string): TransferLifecycle {
    const entry = this.machines.get(transferId);
    if (!entry) {
      throw new NotFoundException(`No state machine found for transfer ${transferId}`);
    }

    return {
      transferId,
      current: entry.current,
      history: [...entry.history],
      isTerminal: TRANSITIONS[entry.current].length === 0,
      nextStates: [...TRANSITIONS[entry.current]],
    };
  }

  transition(transferId: string, next: TransferState): TransferLifecycle {
    const entry = this.machines.get(transferId);
    if (!entry) {
      throw new NotFoundException(`No state machine found for transfer ${transferId}`);
    }

    const allowed = TRANSITIONS[entry.current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid transition for transfer ${transferId}: ${entry.current} -> ${next}. Allowed: [${allowed.join(', ')}]`,
      );
    }

    const record: TransitionRecord = { from: entry.current, to: next, at: Date.now() };
    entry.history.push(record);
    entry.current = next;

    this.logger.log(`Transfer ${transferId}: ${record.from} -> ${next}`);
    return this.get(transferId);
  }

  // Recovery: reset a stuck failed transfer back to a prior recoverable state
  recover(transferId: string): TransferLifecycle {
    const entry = this.machines.get(transferId);
    if (!entry) {
      throw new NotFoundException(`No state machine found for transfer ${transferId}`);
    }

    if (entry.current !== 'failed') {
      throw new BadRequestException(
        `Transfer ${transferId} is not in failed state (current: ${entry.current})`,
      );
    }

    return this.transition(transferId, 'refunded');
  }

  delete(transferId: string): void {
    this.machines.delete(transferId);
  }
}
