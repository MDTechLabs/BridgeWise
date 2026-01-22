import { Injectable } from '@nestjs/common';
import { ConfigService } from './config/config.service';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHello(): string {
    const env = this.configService.get('nodeEnv');
    const port = this.configService.get('server').port;
    return `BridgeWise is running in ${env} mode on port ${port}`;
  }

  getDatabaseInfo(): object {
    return {
      host: this.configService.get('database').host,
      database: this.configService.get('database').database,
      ssl: this.configService.get('database').ssl,
    };
  }

  getRpcUrls(): object {
    return this.configService.get('rpc');
  }
}
