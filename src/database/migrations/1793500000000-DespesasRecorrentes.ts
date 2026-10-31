import { MigrationInterface, QueryRunner } from 'typeorm';

/** Despesas recorrentes e o vínculo da conta a pagar lançada por elas (despesa, competência e valor estimado). */
export class DespesasRecorrentes1793500000000 implements MigrationInterface {
  name = 'DespesasRecorrentes1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."despesas_recorrentes_situacao_enum" AS ENUM('ATIVA', 'PAUSADA', 'ENCERRADA')`);
    await queryRunner.query(`CREATE TYPE "public"."despesas_recorrentes_tipo_valor_enum" AS ENUM('FIXO', 'ESTIMADO', 'PERCENTUAL_FATURAMENTO')`);
    await queryRunner.query(`CREATE TYPE "public"."despesas_recorrentes_ajuste_dia_util_enum" AS ENUM('ANTECIPAR', 'POSTERGAR', 'MANTER')`);
    await queryRunner.query(`CREATE TABLE "despesas_recorrentes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "empresa_id" uuid NOT NULL, "fornecedor_id" uuid NOT NULL, "descricao" character varying(120) NOT NULL, "situacao" "public"."despesas_recorrentes_situacao_enum" NOT NULL DEFAULT 'ATIVA', "tipo_valor" "public"."despesas_recorrentes_tipo_valor_enum" NOT NULL, "valor" numeric(14,2), "percentual" numeric(5,2), "intervalo_meses" smallint NOT NULL DEFAULT '1', "dia_vencimento" smallint NOT NULL, "ajuste_dia_util" "public"."despesas_recorrentes_ajuste_dia_util_enum" NOT NULL DEFAULT 'POSTERGAR', "inicio" character(7) NOT NULL, "fim" character(7), "dias_antecedencia" smallint NOT NULL DEFAULT '10', "plano_conta_id" uuid, "centro_custo_id" uuid, "observacoes" character varying(300), "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_despesas_recorrentes_valor" CHECK (("tipo_valor" = 'PERCENTUAL_FATURAMENTO' AND "percentual" > 0) OR ("tipo_valor" <> 'PERCENTUAL_FATURAMENTO' AND "valor" > 0)), CONSTRAINT "CHK_despesas_recorrentes_vigencia" CHECK ("fim" IS NULL OR "fim" >= "inicio"), CONSTRAINT "CHK_despesas_recorrentes_antecedencia" CHECK ("dias_antecedencia" BETWEEN 0 AND 60), CONSTRAINT "CHK_despesas_recorrentes_dia" CHECK ("dia_vencimento" BETWEEN 1 AND 31), CONSTRAINT "CHK_despesas_recorrentes_intervalo" CHECK ("intervalo_meses" IN (1, 2, 3, 6, 12)), CONSTRAINT "PK_despesas_recorrentes" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_despesas_recorrentes_fornecedor" ON "despesas_recorrentes" ("fornecedor_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_despesas_recorrentes_empresa_situacao" ON "despesas_recorrentes" ("empresa_id", "situacao") `);
    await queryRunner.query(`ALTER TABLE "contas_pagar" ADD "despesa_recorrente_id" uuid`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" ADD "competencia_recorrente" character(7)`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" ADD "estimada" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_contas_pagar_despesa_competencia" ON "contas_pagar" ("despesa_recorrente_id", "competencia_recorrente") WHERE "despesa_recorrente_id" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "FK_despesas_recorrentes_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "FK_despesas_recorrentes_fornecedor" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "FK_despesas_recorrentes_plano_conta" FOREIGN KEY ("plano_conta_id") REFERENCES "plano_contas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" ADD CONSTRAINT "FK_despesas_recorrentes_centro_custo" FOREIGN KEY ("centro_custo_id") REFERENCES "centros_custo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" ADD CONSTRAINT "FK_contas_pagar_despesa_recorrente" FOREIGN KEY ("despesa_recorrente_id") REFERENCES "despesas_recorrentes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contas_pagar" DROP CONSTRAINT "FK_contas_pagar_despesa_recorrente"`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" DROP CONSTRAINT "FK_despesas_recorrentes_centro_custo"`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" DROP CONSTRAINT "FK_despesas_recorrentes_plano_conta"`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" DROP CONSTRAINT "FK_despesas_recorrentes_fornecedor"`);
    await queryRunner.query(`ALTER TABLE "despesas_recorrentes" DROP CONSTRAINT "FK_despesas_recorrentes_empresa"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_contas_pagar_despesa_competencia"`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" DROP COLUMN "estimada"`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" DROP COLUMN "competencia_recorrente"`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" DROP COLUMN "despesa_recorrente_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_despesas_recorrentes_empresa_situacao"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_despesas_recorrentes_fornecedor"`);
    await queryRunner.query(`DROP TABLE "despesas_recorrentes"`);
    await queryRunner.query(`DROP TYPE "public"."despesas_recorrentes_ajuste_dia_util_enum"`);
    await queryRunner.query(`DROP TYPE "public"."despesas_recorrentes_tipo_valor_enum"`);
    await queryRunner.query(`DROP TYPE "public"."despesas_recorrentes_situacao_enum"`);
  }
}
