import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWebhookTables1700000000000 implements MigrationInterface {
  name = 'CreateWebhookTables1700000000000';

  // ──────────────────────────────────────────────────────────────────────────
  // UP
  // ──────────────────────────────────────────────────────────────────────────
  async up(queryRunner: QueryRunner): Promise<void> {
    // ── webhooks ────────────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'webhooks',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'url', type: 'text' },
          { name: 'secret', type: 'text' },
          {
            name: 'events',
            type: 'text',
            // TypeORM simple-array uses comma-separated text
            default: "''",
          },
          { name: 'isActive', type: 'boolean', default: true },
          { name: 'maxRetries', type: 'int', default: 5 },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // ── webhook_deliveries ──────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'webhook_deliveries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          { name: 'webhookId', type: 'uuid' },
          { name: 'event', type: 'varchar' },
          { name: 'payload', type: 'jsonb' },
          { name: 'status', type: 'varchar', default: "'pending'" },
          { name: 'responseStatus', type: 'int', isNullable: true },
          { name: 'responseBody', type: 'text', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'attempt', type: 'int', default: 0 },
          { name: 'nextRetryAt', type: 'timestamptz', isNullable: true },
          { name: 'deliveredAt', type: 'timestamptz', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['webhookId'],
            referencedTableName: 'webhooks',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // ── indexes ─────────────────────────────────────────────────────────────
    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_webhookId_createdAt',
        columnNames: ['webhookId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'webhook_deliveries',
      new TableIndex({
        name: 'IDX_webhook_deliveries_status',
        columnNames: ['status'],
      }),
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DOWN
  // ──────────────────────────────────────────────────────────────────────────
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('webhook_deliveries', true);
    await queryRunner.dropTable('webhooks', true);
  }
}
