import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from './config/config.module';
import { ConfigService } from './config/config.service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StellarReputationModule } from './reputation/providers/stellar/stellar-reputation.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BenchmarkModule } from './benchmark/benchmark.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { TokenMetadataModule } from './token-metadata/token-metadata.module';
import { VersionModule } from './version/version.module';
import { WalletModule } from './wallet/wallet.module';
import { SorobanContractModule } from './contracts/resolver/stellar/soroban-contract.module';
import { StellarTimeoutModule } from './monitoring/timeouts/stellar/stellar-timeout.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggerModule } from './logger/logger.module';
import { StellarExplainabilityModule } from './explainability/routes/stellar/explainability.module';
import { Transaction } from './transactions/entities/transaction.entity';
import { WalletSession } from './wallet/entities/wallet-session.entity';
import { RecommendationV2Module } from './api/routes/v2/recommendation.module';
import { IntelligenceHubModule } from './intelligence-hub/stellar/intelligence-hub.module';
import { AssetDiscoveryModule } from './api/assets/discovery/stellar/asset-discovery.module';
import { RecommendationMetricsModule } from './metrics/recommendations/recommendation-metrics.module';
import { StellarEcosystemMetricsModule } from './metrics/ecosystem/stellar/stellar-ecosystem-metrics.module';
import { StellarProviderDiscoveryModule } from '../../../src/providers/discovery/stellar/stellar-provider-discovery.module';
import { AssetCoverageModule } from '../../../src/analytics/coverage/stellar/asset-coverage.module';
import { RouteInsightsExporterModule } from './exporters/routes/stellar/route-insights-exporter.module';
import { SorobanLifecycleModule } from './analytics/lifecycle/transfers/stellar/soroban-lifecycle.module';
import { SorobanTransferLifecycleEntity } from './analytics/lifecycle/transfers/stellar/entities/soroban-transfer-lifecycle.entity';
import { QuotesModule } from './quotes/quotes.module';
import { RelayerModule } from './relayer/relayer.module';

@Module({
  imports: [
    LoggerModule,
    ConfigModule,
    QuotesModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        return {
          type: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          ssl: dbConfig.ssl,
          entities: [Transaction, WalletSession, SorobanTransferLifecycleEntity],
          synchronize: process.env.NODE_ENV === 'development',
          logging: process.env.NODE_ENV === 'development',
        };
      },
    }),
    TransactionsModule,
    BenchmarkModule,
    AnalyticsModule,
    TokenMetadataModule,
    VersionModule,
    StellarReputationModule,
    WalletModule,
    SorobanContractModule,
    StellarTimeoutModule,
    RecommendationV2Module,
    IntelligenceHubModule,
    AssetDiscoveryModule,
    RecommendationMetricsModule,
    StellarEcosystemMetricsModule,
    StellarProviderDiscoveryModule,
    AssetCoverageModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    // Explainability API for Stellar route recommendations
    // Exposed through /explainability/stellar endpoints.
    StellarExplainabilityModule,
    RouteInsightsExporterModule,
    SorobanLifecycleModule,
    RelayerModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    AppService,
  ],
})
export class AppModule {}