import { Module, Global } from '@nestjs/common';
import { BridgeWiseLogger } from './logger.service';

@Global()
@Module({
  providers: [BridgeWiseLogger],
  exports: [BridgeWiseLogger],
})
export class LoggerModule {}
