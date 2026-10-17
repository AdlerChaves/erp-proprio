import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fornecedores, produtos e serviços, plano de contas, centros de custo e contas bancárias. */
export class Cadastros1792199411702 implements MigrationInterface {
  name = 'Cadastros1792199411702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fornecedores" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "nome" varchar(150) NOT NULL,
        "documento" varchar(14) NOT NULL,
        "email" varchar(150),
        "telefone" varchar(20),
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fornecedores" PRIMARY KEY ("id"),
        CONSTRAINT "FK_fornecedores_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fornecedores_empresa_documento" ON "fornecedores" ("empresa_id", "documento")`,
    );

    await queryRunner.query(`CREATE TYPE "produtos_tipo_enum" AS ENUM ('PRODUTO', 'SERVICO')`);
    await queryRunner.query(`
      CREATE TABLE "produtos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "codigo" varchar(60) NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "tipo" "produtos_tipo_enum" NOT NULL,
        "unidade" varchar(6) NOT NULL,
        "preco_venda" numeric(14,2) NOT NULL,
        "custo" numeric(14,2),
        "ncm" varchar(8),
        "codigo_servico" varchar(5),
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_produtos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_produtos_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_produtos_empresa_codigo" ON "produtos" ("empresa_id", "codigo")`,
    );

    await queryRunner.query(`CREATE TYPE "plano_contas_tipo_enum" AS ENUM ('RECEITA', 'DESPESA')`);
    await queryRunner.query(`
      CREATE TABLE "plano_contas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "codigo" varchar(20) NOT NULL,
        "nome" varchar(150) NOT NULL,
        "tipo" "plano_contas_tipo_enum" NOT NULL,
        "conta_pai_id" uuid,
        "aceita_lancamento" boolean NOT NULL DEFAULT true,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plano_contas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_plano_contas_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_plano_contas_conta_pai" FOREIGN KEY ("conta_pai_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plano_contas_empresa_codigo" ON "plano_contas" ("empresa_id", "codigo")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_plano_contas_conta_pai" ON "plano_contas" ("conta_pai_id")`);

    await queryRunner.query(`
      CREATE TABLE "centros_custo" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "nome" varchar(100) NOT NULL,
        "descricao" varchar(255),
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_centros_custo" PRIMARY KEY ("id"),
        CONSTRAINT "FK_centros_custo_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_centros_custo_empresa_nome" ON "centros_custo" ("empresa_id", "nome")`,
    );

    await queryRunner.query(
      `CREATE TYPE "contas_bancarias_tipo_enum" AS ENUM ('CORRENTE', 'POUPANCA', 'INVESTIMENTO', 'CAIXA')`,
    );
    await queryRunner.query(`
      CREATE TABLE "contas_bancarias" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "nome" varchar(100) NOT NULL,
        "tipo" "contas_bancarias_tipo_enum" NOT NULL,
        "banco" varchar(3),
        "agencia" varchar(10),
        "numero" varchar(20),
        "saldo_inicial" numeric(14,2) NOT NULL,
        "data_saldo_inicial" date NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contas_bancarias" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contas_bancarias_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_contas_bancarias_empresa_nome" ON "contas_bancarias" ("empresa_id", "nome")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contas_bancarias"`);
    await queryRunner.query(`DROP TYPE "contas_bancarias_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "centros_custo"`);
    await queryRunner.query(`DROP TABLE "plano_contas"`);
    await queryRunner.query(`DROP TYPE "plano_contas_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "produtos"`);
    await queryRunner.query(`DROP TYPE "produtos_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "fornecedores"`);
  }
}
