"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBridgeReliabilityTables1700000000000 = void 0;
class CreateBridgeReliabilityTables1700000000000 {
    constructor() {
        this.name = 'CreateBridgeReliabilityTables1700000000000';
    }
    async up(queryRunner) {
        // ── Enums ────────────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TYPE "public"."transaction_outcome_enum" AS ENUM(
        'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED'
      )
    `);
        await queryRunner.query(`
      CREATE TYPE "public"."reliability_tier_enum" AS ENUM(
        'HIGH', 'MEDIUM', 'LOW'
      )
    `);
        // ── bridge_transaction_events ─────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE "bridge_transaction_events" (
        "id"                UUID            NOT NULL DEFAULT uuid_generate_v4(),
        "bridgeName"        VARCHAR(100)    NOT NULL,
        "sourceChain"       VARCHAR(50)     NOT NULL,
        "destinationChain"  VARCHAR(50)     NOT NULL,
        "outcome"           "public"."transaction_outcome_enum" NOT NULL,
        "transactionHash"   VARCHAR(255),
        "failureReason"     TEXT,
        "durationMs"        INTEGER         NOT NULL DEFAULT 0,
        "createdAt"         TIMESTAMPTZ     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bridge_transaction_events" PRIMARY KEY ("id")
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_bte_bridge_name"
        ON "bridge_transaction_events" ("bridgeName")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_bte_route_created"
        ON "bridge_transaction_events" ("bridgeName", "sourceChain", "destinationChain", "createdAt")
    `);
        // ── bridge_reliability_metrics ────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE "bridge_reliability_metrics" (
        "id"                  UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "bridgeName"          VARCHAR(100)  NOT NULL,
        "sourceChain"         VARCHAR(50)   NOT NULL,
        "destinationChain"    VARCHAR(50)   NOT NULL,
        "totalAttempts"       INTEGER       NOT NULL DEFAULT 0,
        "successfulTransfers" INTEGER       NOT NULL DEFAULT 0,
        "failedTransfers"     INTEGER       NOT NULL DEFAULT 0,
        "timeoutCount"        INTEGER       NOT NULL DEFAULT 0,
        "reliabilityPercent"  DECIMAL(5,2)  NOT NULL DEFAULT 0,
        "reliabilityScore"    DECIMAL(5,2)  NOT NULL DEFAULT 0,
        "reliabilityTier"     "public"."reliability_tier_enum" NOT NULL DEFAULT 'LOW',
        "windowConfig"        JSONB,
        "lastComputedAt"      TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bridge_reliability_metrics" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bridge_route" UNIQUE ("bridgeName", "sourceChain", "destinationChain")
      )
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_brm_bridge_name"
        ON "bridge_reliability_metrics" ("bridgeName")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS "bridge_reliability_metrics"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "bridge_transaction_events"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."reliability_tier_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."transaction_outcome_enum"`);
    }
}
exports.CreateBridgeReliabilityTables1700000000000 = CreateBridgeReliabilityTables1700000000000;
//# sourceMappingURL=1700000000000-CreateBridgeReliabilityTables.js.map