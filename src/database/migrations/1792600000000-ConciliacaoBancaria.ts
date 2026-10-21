import { MigrationInterface, QueryRunner } from 'typeorm';

/** Conciliação bancária: arquivos OFX importados e as linhas do extrato ligadas às movimentações. */
export class ConciliacaoBancaria1792600000000 implements MigrationInterface {
  name = 'ConciliacaoBancaria1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "importacoes_extrato" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "conta_bancaria_id" uuid NOT NULL,
        "nome_arquivo" varchar(255) NOT NULL,
        "conta_arquivo" varchar(40),
        "de" date,
        "ate" date,
        "saldo_banco" numeric(14,2),
        "data_saldo_banco" date,
        "transacoes" integer NOT NULL,
        "novas" integer NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_importacoes_extrato" PRIMARY KEY ("id"),
        CONSTRAINT "FK_importacoes_extrato_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_importacoes_extrato_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_importacoes_extrato_conta" ON "importacoes_extrato" ("conta_bancaria_id")`);

    await queryRunner.query(`CREATE TYPE "linhas_extrato_tipo_enum" AS ENUM ('ENTRADA', 'SAIDA')`);
    await queryRunner.query(`
      CREATE TABLE "linhas_extrato" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "conta_bancaria_id" uuid NOT NULL,
        "importacao_id" uuid NOT NULL,
        "chave" varchar(40) NOT NULL,
        "fitid" varchar(255),
        "data" date NOT NULL,
        "tipo" "linhas_extrato_tipo_enum" NOT NULL,
        "valor" numeric(14,2) NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "documento" varchar(60),
        "movimentacao_id" uuid,
        "ignorada" boolean NOT NULL DEFAULT false,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_linhas_extrato" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_linhas_extrato_valor" CHECK ("valor" > 0),
        CONSTRAINT "FK_linhas_extrato_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_linhas_extrato_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_linhas_extrato_importacao" FOREIGN KEY ("importacao_id")
          REFERENCES "importacoes_extrato"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_linhas_extrato_movimentacao" FOREIGN KEY ("movimentacao_id")
          REFERENCES "movimentacoes_bancarias"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_linhas_extrato_conta_chave" ON "linhas_extrato" ("conta_bancaria_id", "chave")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_linhas_extrato_movimentacao" ON "linhas_extrato" ("movimentacao_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_linhas_extrato_conta_data" ON "linhas_extrato" ("conta_bancaria_id", "data")`);
    await queryRunner.query(`CREATE INDEX "IDX_linhas_extrato_importacao" ON "linhas_extrato" ("importacao_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "linhas_extrato"`);
    await queryRunner.query(`DROP TYPE "linhas_extrato_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "importacoes_extrato"`);
  }
}
