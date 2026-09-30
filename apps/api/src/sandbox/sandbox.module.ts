import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxBridgeProvider } from './sandbox-bridge-provider';
import { SandboxInterceptor } from './sandbox.interceptor';
import { SandboxController } from './sandbox.controller';

@Module({
  controllers: [SandboxController],
  providers: [
    SandboxService,
    SandboxBridgeProvider,
    SandboxInterceptor,
  ],
  exports: [
    SandboxService,
    SandboxBridgeProvider,
    SandboxInterceptor,
  ],
})
export class SandboxModule {}
