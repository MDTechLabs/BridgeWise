import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { EnvironmentConfigService } from './environment-config.service';

@Global()
@Module({
  providers: [ConfigService, EnvironmentConfigService],
  exports: [ConfigService, EnvironmentConfigService],
})
export class ConfigModule {}
