import { Module } from '@nestjs/common';
import { ApiKeyVaultService } from './api-key-vault.service';
import { SecureHttpClientService } from './secure-http-client.service';
import { SecureRequestMiddleware } from './secure-request.middleware';
import { ApiSecurityGuard } from './api-security.guard';

@Module({
  providers: [
    ApiKeyVaultService,
    SecureHttpClientService,
    SecureRequestMiddleware,
    ApiSecurityGuard,
  ],
  exports: [
    ApiKeyVaultService,
    SecureHttpClientService,
    SecureRequestMiddleware,
    ApiSecurityGuard,
  ],
})
export class SecurityModule {}
