import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBridgeBenchmarks1700000000000 implements MigrationInterface {
  name = 'CreateBridgeBenchmarks1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "bridge_benchmarks_source_chain_type_enum" AS ENUM ('evm', 'stellar')
    `);

    await queryRunner.query(`
      CREATE TYPE "bridge_benchmarks_destination_chain_type_enum" AS ENUM ('evm', 'stellar')
    `);

    await queryRunner.query(`
      CREATE TYPE "bridge_benchmarks_status_enum" AS ENUM ('pending', 'submitted', 'confirmed', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "bridge_benchmarks" (
        "id"                        UUID                DEFAULT gen_random_uuid() NOT NULL,
        "bridge_name"               VARCHAR             NOT NULL,
        "source_chain"              VARCHAR             NOT NULL,
        "destination_chain"         VARCHAR             NOT NULL,
        "token"                     VARCHAR             NOT NULL,
        "source_chain_type"         "bridge_benchmarks_source_chain_type_enum"      NOT NULL DEFAULT 'evm',
        "destination_chain_type"    "bridge_benchmarks_destination_chain_type_enum" NOT NULL DEFAULT 'evm',
        "status"                    "bridge_benchmarks_status_enum"                 NOT NULL DEFAULT 'pending',
        "transaction_hash"          VARCHAR,
        "destination_tx_hash"       VARCHAR,
        "quote_requested_at"        TIMESTAMPTZ,
        "start_time"                TIMESTAMPTZ         NOT NULL,
        "destination_confirmed_at"  TIMESTAMPTZ,
        "completion_time"           TIMESTAMPTZ,
        "duration_ms"               BIGINT,
        "amount"                    DECIMAL(30, 10),
        "created_at"                TIMESTAMPTZ         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bridge_benchmarks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bridge_benchmarks_route"
        ON "bridge_benchmarks" ("bridge_name", "source_chain", "destination_chain")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bridge_benchmarks_status"
        ON "bridge_benchmarks" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bridge_benchmarks_completion_time"
        ON "bridge_benchmarks" ("completion_time" DESC)
        WHERE "completion_time" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bridge_benchmarks_completion_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bridge_benchmarks_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bridge_benchmarks_route"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bridge_benchmarks"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bridge_benchmarks_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bridge_benchmarks_destination_chain_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "bridge_benchmarks_source_chain_type_enum"`);
  }
}
