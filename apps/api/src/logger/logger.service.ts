import { Injectable, LoggerService, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.TRANSIENT })
export class BridgeWiseLogger implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: any, ...optionalParams: any[]) {
    this.printLog('log', message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.printLog('error', message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.printLog('warn', message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.printLog('debug', message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.printLog('verbose', message, optionalParams);
  }

  private printLog(level: string, message: any, optionalParams: any[]) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      context: this.context,
      message,
      metadata: optionalParams.length > 0 ? optionalParams : undefined,
    };

    console.log(JSON.stringify(logEntry));
  }
}
