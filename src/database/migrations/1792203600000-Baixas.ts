import { MigrationInterface, QueryRunner } from 'typeorm';

const CONTAS = [
  { tabela: 'contas_receber', chave: 'conta_receber_id', tipoMov: 'ENTRADA' },
  { tabela: 'contas_pagar', chave: 'conta_pagar_id', tipoMov: 'SAIDA' },
] as const;

/**
 * Pagamentos passam a ser registros próprios (baixas), permitindo vários por conta (status PARCIAL),
 * com juros, multa e desconto. Contas ganham parcelamento.
 *
 * Cada conta já paga vira uma baixa: o que foi pago acima do valor vira juros, abaixo vira desconto.
 * A movimentação bancária de cada conta passa a apontar para a baixa correspondente.
 */
export class Baixas1792203600000 implements MigrationInterface {
  name = 'Baixas1792203600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "baixas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "conta_receber_id" uuid,
        "conta_pagar_id" uuid,
        "conta_bancaria_id" uuid,
        "data" date NOT NULL,
        "valor" numeric(14,2) NOT NULL,
        "juros" numeric(14,2) NOT NULL,
        "multa" numeric(14,2) NOT NULL,
        "desconto" numeric(14,2) NOT NULL,
        "valor_total" numeric(14,2) NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_baixas" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_baixas_uma_conta" CHECK (num_nonnulls("conta_receber_id", "conta_pagar_id") = 1),
        CONSTRAINT "CHK_baixas_valores"
          CHECK ("valor" > 0 AND "juros" >= 0 AND "multa" >= 0 AND "desconto" >= 0 AND "valor_total" > 0),
        CONSTRAINT "CHK_baixas_total" CHECK ("valor_total" = "valor" + "juros" + "multa" - "desconto"),
        CONSTRAINT "FK_baixas_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_baixas_conta_receber" FOREIGN KEY ("conta_receber_id")
          REFERENCES "contas_receber"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_baixas_conta_pagar" FOREIGN KEY ("conta_pagar_id")
          REFERENCES "contas_pagar"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_baixas_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_baixas_conta_receber" ON "baixas" ("conta_receber_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_baixas_conta_pagar" ON "baixas" ("conta_pagar_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_baixas_conta_bancaria" ON "baixas" ("conta_bancaria_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_baixas_empresa_data" ON "baixas" ("empresa_id", "data")`);

    await queryRunner.query(`ALTER TABLE "movimentacoes_bancarias" ADD "baixa_id" uuid`);

    for (const { tabela, chave } of CONTAS) {
      await queryRunner.query(`
        INSERT INTO "baixas"
          ("empresa_id", "${chave}", "conta_bancaria_id", "data", "valor", "juros", "multa", "desconto", "valor_total")
        SELECT "empresa_id", "id", "conta_bancaria_id", COALESCE("data_pagamento", "data_vencimento"), "valor",
               GREATEST("valor_pago" - "valor", 0), 0, GREATEST("valor" - "valor_pago", 0), "valor_pago"
          FROM "${tabela}"
         WHERE "status" = 'PAGA' AND "valor_pago" IS NOT NULL
      `);
      await queryRunner.query(`
        UPDATE "movimentacoes_bancarias" m SET "baixa_id" = b."id"
          FROM "baixas" b
         WHERE m."${chave}" = b."${chave}"
      `);

      await queryRunner.query(`
        ALTER TABLE "${tabela}"
          DROP COLUMN "valor_pago",
          DROP COLUMN "data_pagamento",
          DROP COLUMN "conta_bancaria_id",
          ADD "parcelamento_id" uuid,
          ADD "parcela" smallint,
          ADD "total_parcelas" smallint
      `);
      await queryRunner.query(`CREATE INDEX "IDX_${tabela}_parcelamento" ON "${tabela}" ("parcelamento_id")`);

      await queryRunner.query(`ALTER TYPE "${tabela}_status_enum" RENAME TO "${tabela}_status_enum_old"`);
      await queryRunner.query(
        `CREATE TYPE "${tabela}_status_enum" AS ENUM ('ABERTA', 'PARCIAL', 'PAGA', 'CANCELADA')`,
      );
      await queryRunner.query(`
        ALTER TABLE "${tabela}"
          ALTER COLUMN "status" DROP DEFAULT,
          ALTER COLUMN "status" TYPE "${tabela}_status_enum" USING "status"::text::"${tabela}_status_enum",
          ALTER COLUMN "status" SET DEFAULT 'ABERTA'
      `);
      await queryRunner.query(`DROP TYPE "${tabela}_status_enum_old"`);
    }

    await queryRunner.query(`
      ALTER TABLE "movimentacoes_bancarias"
        DROP COLUMN "conta_receber_id",
        DROP COLUMN "conta_pagar_id",
        ADD CONSTRAINT "FK_movimentacoes_bancarias_baixa" FOREIGN KEY ("baixa_id")
          REFERENCES "baixas"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_movimentacoes_bancarias_baixa" ON "movimentacoes_bancarias" ("baixa_id")`,
    );
  }

  /** Só reverte se cada conta tiver no máximo uma baixa, que é o que o modelo anterior representa. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ bloqueantes }] = await queryRunner.query(`
      SELECT
        (SELECT count(*) FROM "contas_receber" WHERE "status" = 'PARCIAL') +
        (SELECT count(*) FROM "contas_pagar" WHERE "status" = 'PARCIAL') +
        (SELECT count(*) FROM (
           SELECT 1 FROM "baixas" GROUP BY "conta_receber_id", "conta_pagar_id" HAVING count(*) > 1
         ) multiplas) AS bloqueantes
    `);
    if (Number(bloqueantes) > 0) {
      throw new Error(
        'Não é possível reverter: há contas com pagamento parcial ou mais de uma baixa. Estorne-as antes.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "movimentacoes_bancarias"
        ADD "conta_receber_id" uuid,
        ADD "conta_pagar_id" uuid
    `);

    for (const { tabela, chave } of CONTAS) {
      await queryRunner.query(`ALTER TYPE "${tabela}_status_enum" RENAME TO "${tabela}_status_enum_old"`);
      await queryRunner.query(`CREATE TYPE "${tabela}_status_enum" AS ENUM ('ABERTA', 'PAGA', 'CANCELADA')`);
      await queryRunner.query(`
        ALTER TABLE "${tabela}"
          ALTER COLUMN "status" DROP DEFAULT,
          ALTER COLUMN "status" TYPE "${tabela}_status_enum" USING "status"::text::"${tabela}_status_enum",
          ALTER COLUMN "status" SET DEFAULT 'ABERTA'
      `);
      await queryRunner.query(`DROP TYPE "${tabela}_status_enum_old"`);

      await queryRunner.query(`
        ALTER TABLE "${tabela}"
          DROP COLUMN "parcelamento_id",
          DROP COLUMN "parcela",
          DROP COLUMN "total_parcelas",
          ADD "valor_pago" numeric(14,2),
          ADD "data_pagamento" date,
          ADD "conta_bancaria_id" uuid,
          ADD CONSTRAINT "FK_${tabela}_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
            REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT
      `);
      await queryRunner.query(
        `CREATE INDEX "IDX_${tabela}_conta_bancaria" ON "${tabela}" ("conta_bancaria_id")`,
      );
      await queryRunner.query(`
        UPDATE "${tabela}" c
           SET "valor_pago" = b."valor_total", "data_pagamento" = b."data", "conta_bancaria_id" = b."conta_bancaria_id"
          FROM "baixas" b
         WHERE b."${chave}" = c."id"
      `);
      await queryRunner.query(`
        UPDATE "movimentacoes_bancarias" m SET "${chave}" = b."${chave}"
          FROM "baixas" b
         WHERE m."baixa_id" = b."id" AND b."${chave}" IS NOT NULL
      `);
      await queryRunner.query(`
        ALTER TABLE "movimentacoes_bancarias"
          ADD CONSTRAINT "FK_movimentacoes_bancarias_${chave.replace('_id', '')}" FOREIGN KEY ("${chave}")
            REFERENCES "${tabela}"("id") ON DELETE RESTRICT
      `);
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_movimentacoes_bancarias_${chave.replace('_id', '')}"
          ON "movimentacoes_bancarias" ("${chave}")
      `);
    }

    await queryRunner.query(`ALTER TABLE "movimentacoes_bancarias" DROP COLUMN "baixa_id"`);
    await queryRunner.query(`DROP TABLE "baixas"`);
  }
}
