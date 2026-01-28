import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HopAdapter } from './adapters/hop.adapter';
import { HopService } from './hop.service';
import { ConfigModule } from '../config/config.module';

/**
 * STEP 15: Creating the Hop Module
 * =================================
 *
 * In NestJS, a "Module" is like a container that groups related code together.
 * Think of it like organizing your closet:
 * - All your shirts go in one drawer
 * - All your pants go in another drawer
 * - This module is the "Hop Protocol drawer"
 *
 * What does this module do?
 * 1. Imports dependencies (HttpModule for making API calls, ConfigModule for settings)
 * 2. Provides services (HopAdapter and HopService)
 * 3. Exports services (makes them available to other parts of the app)
 *
 * Why do we need a module?
 * - Keeps code organized
 * - Makes dependencies clear
 * - Enables dependency injection (NestJS automatically creates and injects instances)
 * - Makes testing easier (we can test this module in isolation)
 */

@Module({
  /**
   * IMPORTS: Other modules we depend on
   * ====================================
   *
   * - HttpModule: Provides HttpService for making HTTP requests to Hop API
   * - ConfigModule: Provides ConfigService for accessing environment variables
   */
  imports: [
    HttpModule.register({
      timeout: 10000, // 10 second timeout for HTTP requests
      maxRedirects: 5, // Follow up to 5 redirects
    }),
    ConfigModule,
  ],

  /**
   * PROVIDERS: Services this module creates
   * ========================================
   *
   * These are the "workers" of our module.
   * NestJS will create one instance of each and manage their lifecycle.
   *
   * - HopService: Handles route/fee normalization and caching
   * - HopAdapter: Handles communication with Hop API
   */
  providers: [HopService, HopAdapter],

  /**
   * EXPORTS: Services we make available to other modules
   * =====================================================
   *
   * Other modules can import HopModule and use these services.
   *
   * Example:
   * ```typescript
   * @Module({
   *   imports: [HopModule],
   * })
   * export class SomeOtherModule {
   *   constructor(private hopAdapter: HopAdapter) {}
   * }
   * ```
   */
  exports: [HopService, HopAdapter],
})
export class HopModule {}
