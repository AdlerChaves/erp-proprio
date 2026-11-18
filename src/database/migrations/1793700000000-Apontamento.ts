import { MigrationInterface, QueryRunner } from 'typeorm';

/** Painel de apontamento: etapas padrão da empresa, etapas de cada obra (Centro de Custo), situação e observação da obra e dias de alerta. */
export class Apontamento1793700000000 implements MigrationInterface {
  name = 'Apontamento1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "etapas_padrao" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "empresa_id" uuid NOT NULL, "nome" character varying(100) NOT NULL, "ordem" smallint NOT NULL, "ativo" boolean NOT NULL DEFAULT true, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_etapas_padrao" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_etapas_padrao_empresa_nome" ON "etapas_padrao" ("empresa_id", "nome") `);
    await queryRunner.query(`CREATE TABLE "etapas_centro_custo" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "empresa_id" uuid NOT NULL, "centro_custo_id" uuid NOT NULL, "nome" character varying(100) NOT NULL, "ordem" smallint NOT NULL, "data_limite" date, "concluida_em" date, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_etapas_centro_custo" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_etapas_centro_custo_centro" ON "etapas_centro_custo" ("centro_custo_id", "ordem") `);
    await queryRunner.query(`ALTER TABLE "empresas" ADD "dias_alerta_etapa" smallint NOT NULL DEFAULT '3'`);
    await queryRunner.query(`CREATE TYPE "public"."situacao_obra" AS ENUM('EM_EXECUCAO', 'AGUARDANDO_MATERIAL', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_EQUIPE', 'PAUSADO', 'CONCLUIDO')`);
    await queryRunner.query(`ALTER TABLE "centros_custo" ADD "situacao" "public"."situacao_obra"`);
    await queryRunner.query(`ALTER TABLE "centros_custo" ADD "observacao" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "etapas_padrao" ADD CONSTRAINT "FK_etapas_padrao_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "etapas_centro_custo" ADD CONSTRAINT "FK_etapas_centro_custo_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "etapas_centro_custo" ADD CONSTRAINT "FK_etapas_centro_custo_centro" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    // Empresas que já existem ganham as mesmas etapas padrão que uma empresa nova recebe.
    await queryRunner.query(`INSERT INTO "etapas_padrao" ("empresa_id", "nome", "ordem") SELECT e."id", v."nome", v."ordem" FROM "empresas" e CROSS JOIN (VALUES ('Levantamento', 1), ('Orçamento aprovado', 2), ('Compra de material', 3), ('Infraestrutura', 4), ('Fiação e quadros', 5), ('Testes e entrega', 6)) AS v("nome", "ordem")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "etapas_centro_custo" DROP CONSTRAINT "FK_etapas_centro_custo_centro"`);
    await queryRunner.query(`ALTER TABLE "etapas_centro_custo" DROP CONSTRAINT "FK_etapas_centro_custo_empresa"`);
    await queryRunner.query(`ALTER TABLE "etapas_padrao" DROP CONSTRAINT "FK_etapas_padrao_empresa"`);
    await queryRunner.query(`ALTER TABLE "centros_custo" DROP COLUMN "observacao"`);
    await queryRunner.query(`ALTER TABLE "centros_custo" DROP COLUMN "situacao"`);
    await queryRunner.query(`DROP TYPE "public"."situacao_obra"`);
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "dias_alerta_etapa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_etapas_centro_custo_centro"`);
    await queryRunner.query(`DROP TABLE "etapas_centro_custo"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_etapas_padrao_empresa_nome"`);
    await queryRunner.query(`DROP TABLE "etapas_padrao"`);
  }
}
