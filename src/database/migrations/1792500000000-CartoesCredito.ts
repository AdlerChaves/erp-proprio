import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cartões de crédito: o cartão, as faturas de cada mês (com datas ajustáveis) e os lançamentos.
 * A fatura é uma conta a pagar ligada a ela por fatura_cartao_id.
 */
export class CartoesCredito1792500000000 implements MigrationInterface {
  name = 'CartoesCredito1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "cartoes_credito" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "nome" varchar(100) NOT NULL,
        "final" varchar(4),
        "conta_bancaria_id" uuid NOT NULL,
        "fornecedor_id" uuid NOT NULL,
        "dia_fechamento" smallint NOT NULL,
        "dia_vencimento" smallint NOT NULL,
        "limite" numeric(14,2),
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cartoes_credito" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cartoes_credito_dias" CHECK ("dia_fechamento" BETWEEN 1 AND 31 AND "dia_vencimento" BETWEEN 1 AND 31),
        CONSTRAINT "FK_cartoes_credito_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cartoes_credito_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cartoes_credito_fornecedor" FOREIGN KEY ("fornecedor_id")
          REFERENCES "fornecedores"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_cartoes_credito_empresa_nome" ON "cartoes_credito" ("empresa_id", "nome")`);

    await queryRunner.query(`CREATE TYPE "faturas_cartao_status_enum" AS ENUM ('ABERTA', 'FECHADA')`);
    await queryRunner.query(`
      CREATE TABLE "faturas_cartao" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "cartao_id" uuid NOT NULL,
        "competencia" varchar(7) NOT NULL,
        "data_fechamento" date NOT NULL,
        "data_vencimento" date NOT NULL,
        "datas_ajustadas" boolean NOT NULL DEFAULT false,
        "status" "faturas_cartao_status_enum" NOT NULL DEFAULT 'ABERTA',
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_faturas_cartao" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_faturas_cartao_datas" CHECK ("data_fechamento" <= "data_vencimento"),
        CONSTRAINT "FK_faturas_cartao_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_faturas_cartao_cartao" FOREIGN KEY ("cartao_id") REFERENCES "cartoes_credito"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_faturas_cartao_cartao_competencia" ON "faturas_cartao" ("cartao_id", "competencia")`,
    );

    await queryRunner.query(`CREATE TYPE "lancamentos_cartao_tipo_enum" AS ENUM ('COMPRA', 'ESTORNO')`);
    await queryRunner.query(`
      CREATE TABLE "lancamentos_cartao" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "cartao_id" uuid NOT NULL,
        "fatura_id" uuid NOT NULL,
        "compra_id" uuid NOT NULL,
        "data" date NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "tipo" "lancamentos_cartao_tipo_enum" NOT NULL DEFAULT 'COMPRA',
        "valor" numeric(14,2) NOT NULL,
        "parcela" smallint,
        "total_parcelas" smallint,
        "plano_conta_id" uuid,
        "centro_custo_id" uuid,
        "fornecedor_id" uuid,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "seq" bigserial NOT NULL,
        CONSTRAINT "PK_lancamentos_cartao" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_lancamentos_cartao_valor" CHECK ("valor" > 0),
        CONSTRAINT "FK_lancamentos_cartao_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_lancamentos_cartao_cartao" FOREIGN KEY ("cartao_id") REFERENCES "cartoes_credito"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_lancamentos_cartao_fatura" FOREIGN KEY ("fatura_id") REFERENCES "faturas_cartao"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_lancamentos_cartao_plano_conta" FOREIGN KEY ("plano_conta_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_lancamentos_cartao_centro_custo" FOREIGN KEY ("centro_custo_id")
          REFERENCES "centros_custo"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_lancamentos_cartao_fornecedor" FOREIGN KEY ("fornecedor_id")
          REFERENCES "fornecedores"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_lancamentos_cartao_fatura" ON "lancamentos_cartao" ("fatura_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_lancamentos_cartao_compra" ON "lancamentos_cartao" ("compra_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_lancamentos_cartao_cartao_data" ON "lancamentos_cartao" ("cartao_id", "data")`);
    await queryRunner.query(`CREATE INDEX "IDX_lancamentos_cartao_plano_conta" ON "lancamentos_cartao" ("plano_conta_id")`);

    await queryRunner.query(`
      ALTER TABLE "contas_pagar" ADD "fatura_cartao_id" uuid,
        ADD CONSTRAINT "FK_contas_pagar_fatura_cartao" FOREIGN KEY ("fatura_cartao_id")
          REFERENCES "faturas_cartao"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_contas_pagar_fatura_cartao" ON "contas_pagar" ("fatura_cartao_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_contas_pagar_fatura_cartao"`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" DROP CONSTRAINT "FK_contas_pagar_fatura_cartao", DROP COLUMN "fatura_cartao_id"`);
    await queryRunner.query(`DROP TABLE "lancamentos_cartao"`);
    await queryRunner.query(`DROP TYPE "lancamentos_cartao_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "faturas_cartao"`);
    await queryRunner.query(`DROP TYPE "faturas_cartao_status_enum"`);
    await queryRunner.query(`DROP TABLE "cartoes_credito"`);
  }
}
