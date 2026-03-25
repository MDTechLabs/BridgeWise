import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration to create the bridge_analytics table
 * Stores aggregated analytics data for bridge routes
 */
export class CreateBridgeAnalytics1700000000000 implements MigrationInterface {
  name = 'CreateBridgeAnalytics1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the bridge_analytics table
    await queryRunner.createTable(
      new Table({
        name: 'bridge_analytics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'bridge_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'source_chain',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'destination_chain',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'token',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'total_transfers',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'successful_transfers',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'failed_transfers',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'average_settlement_time_ms',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'average_fee',
            type: 'decimal',
            precision: 30,
            scale: 10,
            isNullable: true,
          },
          {
            name: 'average_slippage_percent',
            type: 'decimal',
            precision: 10,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'total_volume',
            type: 'decimal',
            precision: 30,
            scale: 10,
            default: 0,
            isNullable: false,
          },
          {
            name: 'min_settlement_time_ms',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'max_settlement_time_ms',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'last_updated',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create composite index for route lookups
    await queryRunner.createIndex(
      'bridge_analytics',
      new TableIndex({
        name: 'IDX_BRIDGE_ANALYTICS_ROUTE',
        columnNames: ['bridge_name', 'source_chain', 'destination_chain'],
      }),
    );

    // Create index for token lookups
    await queryRunner.createIndex(
      'bridge_analytics',
      new TableIndex({
        name: 'IDX_BRIDGE_ANALYTICS_TOKEN',
        columnNames: ['token'],
      }),
    );

    // Create index for last_updated (for cache invalidation)
    await queryRunner.createIndex(
      'bridge_analytics',
      new TableIndex({
        name: 'IDX_BRIDGE_ANALYTICS_LAST_UPDATED',
        columnNames: ['last_updated'],
      }),
    );

    // Create index for total_transfers (for sorting by popularity)
    await queryRunner.createIndex(
      'bridge_analytics',
      new TableIndex({
        name: 'IDX_BRIDGE_ANALYTICS_TOTAL_TRANSFERS',
        columnNames: ['total_transfers'],
      }),
    );

    // Create index for success rate calculations
    await queryRunner.createIndex(
      'bridge_analytics',
      new TableIndex({
        name: 'IDX_BRIDGE_ANALYTICS_SUCCESS',
        columnNames: ['successful_transfers', 'total_transfers'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('bridge_analytics');
  }
}
