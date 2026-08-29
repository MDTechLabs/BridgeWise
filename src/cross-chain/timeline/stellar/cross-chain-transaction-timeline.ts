import { StellarTransferTimelineGenerator } from '../../../timeline/transfers/stellar/stellar-transfer-timeline';
import type {
  TimelineRenderOptions,
  TransferTimeline,
} from '../../../timeline/transfers/stellar/types';
import type { TransferLifecycle } from '../../../transfers/state-machine/stellar';

export class CrossChainTransactionTimeline {
  private readonly generator = new StellarTransferTimelineGenerator();

  build(lifecycle: TransferLifecycle): TransferTimeline {
    return this.generator.generate(lifecycle);
  }

  render(timeline: TransferTimeline, options: TimelineRenderOptions = {}): string {
    return this.generator.render(timeline, options);
  }
}

