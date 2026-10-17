import { MigrationInterface, QueryRunner } from 'typeorm';

/** Contas a pagar, espelhando contas a receber: fornecedor, categoria de despesa, centro de custo e conta da baixa. */
export class ContasPagar1792201531712 implements MigrationInterface {
  name = 'ContasPagar1792201531712';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "contas_pagar_status_enum" AS ENUM ('ABERTA', 'PAGA', 'CANCELADA')`,
    );
    await queryRunner.query(`
      CREATE TABLE "contas_pagar" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "fornecedor_id" uuid NOT NULL,
        "plano_conta_id" uuid,
        "centro_custo_id" uuid,
        "conta_bancaria_id" uuid,
        "descricao" varchar(255) NOT NULL,
        "valor" numeric(14,2) NOT NULL,
        "data_emissao" date NOT NULL,
        "data_vencimento" date NOT NULL,
        "data_pagamento" date,
        "valor_pago" numeric(14,2),
        "status" "contas_pagar_status_enum" NOT NULL DEFAULT 'ABERTA',
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contas_pagar" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contas_pagar_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contas_pagar_fornecedor" FOREIGN KEY ("fornecedor_id")
          REFERENCES "fornecedores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contas_pagar_plano_conta" FOREIGN KEY ("plano_conta_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contas_pagar_centro_custo" FOREIGN KEY ("centro_custo_id")
          REFERENCES "centros_custo"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_contas_pagar_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_contas_pagar_empresa_status_vencimento"
        ON "contas_pagar" ("empresa_id", "status", "data_vencimento")
    `);
    await queryRunner.query(`CREATE INDEX "IDX_contas_pagar_fornecedor" ON "contas_pagar" ("fornecedor_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_contas_pagar_plano_conta" ON "contas_pagar" ("plano_conta_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_contas_pagar_centro_custo" ON "contas_pagar" ("centro_custo_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_contas_pagar_conta_bancaria" ON "contas_pagar" ("conta_bancaria_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contas_pagar"`);
    await queryRunner.query(`DROP TYPE "contas_pagar_status_enum"`);
  }
}
