import { MigrationInterface, QueryRunner } from 'typeorm';

export class Inicial1760659200000 implements MigrationInterface {
  name = 'Inicial1760659200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "clientes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nome" varchar(150) NOT NULL,
        "documento" varchar(14) NOT NULL,
        "email" varchar(150),
        "telefone" varchar(20),
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clientes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_clientes_documento" UNIQUE ("documento")
      )
    `);
    await queryRunner.query(
      `CREATE TYPE "contas_receber_status_enum" AS ENUM ('ABERTA', 'PAGA', 'CANCELADA')`,
    );
    await queryRunner.query(`
      CREATE TABLE "contas_receber" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cliente_id" uuid NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "valor" numeric(14,2) NOT NULL,
        "data_emissao" date NOT NULL,
        "data_vencimento" date NOT NULL,
        "data_pagamento" date,
        "valor_pago" numeric(14,2),
        "status" "contas_receber_status_enum" NOT NULL DEFAULT 'ABERTA',
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contas_receber" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contas_receber_cliente" FOREIGN KEY ("cliente_id")
          REFERENCES "clientes"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_contas_receber_status_vencimento" ON "contas_receber" ("status", "data_vencimento")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_contas_receber_cliente" ON "contas_receber" ("cliente_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contas_receber"`);
    await queryRunner.query(`DROP TYPE "contas_receber_status_enum"`);
    await queryRunner.query(`DROP TABLE "clientes"`);
  }
}
