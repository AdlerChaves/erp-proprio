import { MigrationInterface, QueryRunner } from 'typeorm';

/** Contratos recorrentes: o contrato, os itens, a cobrança de cada mês e o vínculo da venda gerada com o contrato. */
export class Contratos1793400000000 implements MigrationInterface {
  name = 'Contratos1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."contratos_situacao_enum" AS ENUM('ATIVO', 'PAUSADO', 'ENCERRADO')`);
    await queryRunner.query(`CREATE TABLE "contratos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "empresa_id" uuid NOT NULL, "numero" integer NOT NULL, "cliente_id" uuid NOT NULL, "descricao" character varying(120) NOT NULL, "situacao" "public"."contratos_situacao_enum" NOT NULL DEFAULT 'ATIVO', "inicio" character(7) NOT NULL, "fim" character(7), "dia_faturamento" smallint NOT NULL, "dia_vencimento" smallint NOT NULL, "emitir_nfse" boolean NOT NULL DEFAULT false, "transmitir_nfse" boolean NOT NULL DEFAULT false, "plano_conta_id" uuid, "centro_custo_id" uuid, "observacoes" character varying(300), "valor" numeric(14,2) NOT NULL, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_contratos_transmitir" CHECK (NOT "transmitir_nfse" OR "emitir_nfse"), CONSTRAINT "CHK_contratos_vigencia" CHECK ("fim" IS NULL OR "fim" >= "inicio"), CONSTRAINT "CHK_contratos_dias" CHECK ("dia_faturamento" BETWEEN 1 AND 28 AND "dia_vencimento" BETWEEN 1 AND 28), CONSTRAINT "PK_contratos" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_contratos_cliente" ON "contratos" ("cliente_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_contratos_empresa_situacao" ON "contratos" ("empresa_id", "situacao") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_contratos_empresa_numero" ON "contratos" ("empresa_id", "numero") `);
    await queryRunner.query(`CREATE TABLE "itens_contrato" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "contrato_id" uuid NOT NULL, "produto_id" uuid NOT NULL, "ordem" smallint NOT NULL, "quantidade" numeric(14,3) NOT NULL, "preco_unitario" numeric(14,2) NOT NULL, "desconto" numeric(14,2) NOT NULL DEFAULT '0', "total" numeric(14,2) NOT NULL, CONSTRAINT "PK_itens_contrato" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_itens_contrato_contrato" ON "itens_contrato" ("contrato_id") `);
    await queryRunner.query(`CREATE TYPE "public"."geracoes_contrato_situacao_enum" AS ENUM('PROCESSANDO', 'CONCLUIDA', 'FALHA')`);
    await queryRunner.query(`CREATE TABLE "geracoes_contrato" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "empresa_id" uuid NOT NULL, "contrato_id" uuid NOT NULL, "competencia" character(7) NOT NULL, "situacao" "public"."geracoes_contrato_situacao_enum" NOT NULL DEFAULT 'PROCESSANDO', "venda_id" uuid, "erro" character varying(1000), "automatica" boolean NOT NULL DEFAULT false, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_geracoes_contrato" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_geracoes_contrato_empresa_competencia" ON "geracoes_contrato" ("empresa_id", "competencia") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_geracoes_contrato_competencia" ON "geracoes_contrato" ("contrato_id", "competencia") `);
    await queryRunner.query(`ALTER TABLE "vendas" ADD "contrato_id" uuid`);
    await queryRunner.query(`ALTER TABLE "vendas" ADD "competencia_contrato" character(7)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_vendas_contrato_competencia" ON "vendas" ("contrato_id", "competencia_contrato") WHERE "contrato_id" IS NOT NULL AND "status" <> 'CANCELADA'`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD CONSTRAINT "FK_contratos_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD CONSTRAINT "FK_contratos_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD CONSTRAINT "FK_contratos_plano_conta" FOREIGN KEY ("plano_conta_id") REFERENCES "plano_contas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contratos" ADD CONSTRAINT "FK_contratos_centro_custo" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "itens_contrato" ADD CONSTRAINT "FK_itens_contrato_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "itens_contrato" ADD CONSTRAINT "FK_itens_contrato_produto" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "geracoes_contrato" ADD CONSTRAINT "FK_geracoes_contrato_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "geracoes_contrato" ADD CONSTRAINT "FK_geracoes_contrato_venda" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "vendas" ADD CONSTRAINT "FK_vendas_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendas" DROP CONSTRAINT "FK_vendas_contrato"`);
    await queryRunner.query(`ALTER TABLE "geracoes_contrato" DROP CONSTRAINT "FK_geracoes_contrato_venda"`);
    await queryRunner.query(`ALTER TABLE "geracoes_contrato" DROP CONSTRAINT "FK_geracoes_contrato_contrato"`);
    await queryRunner.query(`ALTER TABLE "itens_contrato" DROP CONSTRAINT "FK_itens_contrato_produto"`);
    await queryRunner.query(`ALTER TABLE "itens_contrato" DROP CONSTRAINT "FK_itens_contrato_contrato"`);
    await queryRunner.query(`ALTER TABLE "contratos" DROP CONSTRAINT "FK_contratos_centro_custo"`);
    await queryRunner.query(`ALTER TABLE "contratos" DROP CONSTRAINT "FK_contratos_plano_conta"`);
    await queryRunner.query(`ALTER TABLE "contratos" DROP CONSTRAINT "FK_contratos_cliente"`);
    await queryRunner.query(`ALTER TABLE "contratos" DROP CONSTRAINT "FK_contratos_empresa"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_vendas_contrato_competencia"`);
    await queryRunner.query(`ALTER TABLE "vendas" DROP COLUMN "competencia_contrato"`);
    await queryRunner.query(`ALTER TABLE "vendas" DROP COLUMN "contrato_id"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_geracoes_contrato_competencia"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_geracoes_contrato_empresa_competencia"`);
    await queryRunner.query(`DROP TABLE "geracoes_contrato"`);
    await queryRunner.query(`DROP TYPE "public"."geracoes_contrato_situacao_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_itens_contrato_contrato"`);
    await queryRunner.query(`DROP TABLE "itens_contrato"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_contratos_empresa_numero"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_contratos_empresa_situacao"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_contratos_cliente"`);
    await queryRunner.query(`DROP TABLE "contratos"`);
    await queryRunner.query(`DROP TYPE "public"."contratos_situacao_enum"`);
  }
}
