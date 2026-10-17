import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Movimentações bancárias: baixas, transferências e lançamentos avulsos.
 * Gera as movimentações das contas já pagas com conta bancária, para o saldo partir correto.
 */
export class MovimentacoesBancarias1792202476071 implements MigrationInterface {
  name = 'MovimentacoesBancarias1792202476071';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "movimentacoes_bancarias_tipo_enum" AS ENUM ('ENTRADA', 'SAIDA')`);
    await queryRunner.query(`
      CREATE TYPE "movimentacoes_bancarias_origem_enum"
        AS ENUM ('CONTA_RECEBER', 'CONTA_PAGAR', 'TRANSFERENCIA', 'AVULSA')
    `);
    await queryRunner.query(`
      CREATE TABLE "movimentacoes_bancarias" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "conta_bancaria_id" uuid NOT NULL,
        "data" date NOT NULL,
        "tipo" "movimentacoes_bancarias_tipo_enum" NOT NULL,
        "valor" numeric(14,2) NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "origem" "movimentacoes_bancarias_origem_enum" NOT NULL,
        "conta_receber_id" uuid,
        "conta_pagar_id" uuid,
        "transferencia_id" uuid,
        "plano_conta_id" uuid,
        "centro_custo_id" uuid,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_movimentacoes_bancarias" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_movimentacoes_bancarias_valor" CHECK ("valor" > 0),
        CONSTRAINT "FK_movimentacoes_bancarias_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_bancarias_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_bancarias_conta_receber" FOREIGN KEY ("conta_receber_id")
          REFERENCES "contas_receber"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_bancarias_conta_pagar" FOREIGN KEY ("conta_pagar_id")
          REFERENCES "contas_pagar"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_bancarias_plano_conta" FOREIGN KEY ("plano_conta_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_bancarias_centro_custo" FOREIGN KEY ("centro_custo_id")
          REFERENCES "centros_custo"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movimentacoes_bancarias_conta_data"
        ON "movimentacoes_bancarias" ("conta_bancaria_id", "data")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movimentacoes_bancarias_empresa_data"
        ON "movimentacoes_bancarias" ("empresa_id", "data")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_movimentacoes_bancarias_conta_receber"
        ON "movimentacoes_bancarias" ("conta_receber_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_movimentacoes_bancarias_conta_pagar"
        ON "movimentacoes_bancarias" ("conta_pagar_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movimentacoes_bancarias_transferencia"
        ON "movimentacoes_bancarias" ("transferencia_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movimentacoes_bancarias_plano_conta"
        ON "movimentacoes_bancarias" ("plano_conta_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_movimentacoes_bancarias_centro_custo"
        ON "movimentacoes_bancarias" ("centro_custo_id")
    `);

    await queryRunner.query(`
      INSERT INTO "movimentacoes_bancarias"
        ("empresa_id", "conta_bancaria_id", "data", "tipo", "valor", "descricao", "origem", "conta_receber_id")
      SELECT "empresa_id", "conta_bancaria_id", "data_pagamento", 'ENTRADA', "valor_pago",
             LEFT('Recebimento: ' || "descricao", 255), 'CONTA_RECEBER', "id"
        FROM "contas_receber"
       WHERE "status" = 'PAGA' AND "conta_bancaria_id" IS NOT NULL
    `);
    await queryRunner.query(`
      INSERT INTO "movimentacoes_bancarias"
        ("empresa_id", "conta_bancaria_id", "data", "tipo", "valor", "descricao", "origem", "conta_pagar_id")
      SELECT "empresa_id", "conta_bancaria_id", "data_pagamento", 'SAIDA', "valor_pago",
             LEFT('Pagamento: ' || "descricao", 255), 'CONTA_PAGAR', "id"
        FROM "contas_pagar"
       WHERE "status" = 'PAGA' AND "conta_bancaria_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "movimentacoes_bancarias"`);
    await queryRunner.query(`DROP TYPE "movimentacoes_bancarias_origem_enum"`);
    await queryRunner.query(`DROP TYPE "movimentacoes_bancarias_tipo_enum"`);
  }
}
