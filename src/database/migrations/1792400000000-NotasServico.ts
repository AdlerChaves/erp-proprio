import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nota fiscal de serviço no leiaute nacional (DPS): dados fiscais da empresa, endereço e inscrição
 * municipal do cliente, códigos de tributação do serviço e a tabela das notas.
 */
export class NotasServico1792400000000 implements MigrationInterface {
  name = 'NotasServico1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "empresas_regime_tributario_enum" AS ENUM ('SIMPLES_NACIONAL', 'MEI', 'LUCRO_PRESUMIDO', 'LUCRO_REAL')
    `);
    await queryRunner.query(`
      ALTER TABLE "empresas"
        ADD "inscricao_municipal" varchar(15),
        ADD "codigo_municipio" varchar(7),
        ADD "regime_tributario" "empresas_regime_tributario_enum",
        ADD "regime_apuracao_simples" smallint NOT NULL DEFAULT 1,
        ADD "aliquota_simples" numeric(5,2),
        ADD "nfse_serie" varchar(5) NOT NULL DEFAULT '1',
        ADD "nfse_ambiente" smallint NOT NULL DEFAULT 2
    `);
    await queryRunner.query(`ALTER TABLE "clientes" ADD "inscricao_municipal" varchar(15), ADD "endereco" jsonb`);
    await queryRunner.query(`ALTER TABLE "produtos" ADD "codigo_tributacao_nacional" varchar(6), ADD "codigo_nbs" varchar(9)`);

    await queryRunner.query(`CREATE TYPE "notas_servico_status_enum" AS ENUM ('PENDENTE', 'EMITIDA', 'CANCELADA')`);
    await queryRunner.query(`
      CREATE TABLE "notas_servico" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "venda_id" uuid,
        "cliente_id" uuid NOT NULL,
        "status" "notas_servico_status_enum" NOT NULL DEFAULT 'PENDENTE',
        "ambiente" smallint NOT NULL,
        "serie" varchar(5) NOT NULL,
        "numero_dps" integer NOT NULL,
        "data_competencia" date NOT NULL,
        "gerada_em" timestamptz NOT NULL,
        "codigo_tributacao_nacional" varchar(6) NOT NULL,
        "codigo_nbs" varchar(9),
        "municipio_prestacao" varchar(7) NOT NULL,
        "descricao" varchar(2000) NOT NULL,
        "valor_servicos" numeric(14,2) NOT NULL,
        "desconto_incondicionado" numeric(14,2) NOT NULL DEFAULT 0,
        "iss_retido" boolean NOT NULL DEFAULT false,
        "aliquota_iss" numeric(5,2),
        "xml_dps" text NOT NULL,
        "numero_nfse" varchar(15),
        "codigo_verificacao" varchar(60),
        "chave_acesso" varchar(50),
        "data_emissao_nfse" date,
        "motivo_cancelamento" varchar(255),
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notas_servico" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notas_servico_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_notas_servico_venda" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_notas_servico_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notas_servico_empresa_serie_numero" ON "notas_servico" ("empresa_id", "serie", "numero_dps")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notas_servico_empresa_numero_nfse" ON "notas_servico" ("empresa_id", "numero_nfse")
        WHERE "numero_nfse" IS NOT NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notas_servico_venda" ON "notas_servico" ("venda_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_notas_servico_empresa_status" ON "notas_servico" ("empresa_id", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notas_servico"`);
    await queryRunner.query(`DROP TYPE "notas_servico_status_enum"`);
    await queryRunner.query(`ALTER TABLE "produtos" DROP COLUMN "codigo_nbs", DROP COLUMN "codigo_tributacao_nacional"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "endereco", DROP COLUMN "inscricao_municipal"`);
    await queryRunner.query(`
      ALTER TABLE "empresas"
        DROP COLUMN "nfse_ambiente",
        DROP COLUMN "nfse_serie",
        DROP COLUMN "aliquota_simples",
        DROP COLUMN "regime_apuracao_simples",
        DROP COLUMN "regime_tributario",
        DROP COLUMN "codigo_municipio",
        DROP COLUMN "inscricao_municipal"
    `);
    await queryRunner.query(`DROP TYPE "empresas_regime_tributario_enum"`);
  }
}
