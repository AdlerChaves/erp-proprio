import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vendas, compras e estoque. O produto ganha o saldo físico; o custo passa a ser o custo médio,
 * recalculado a cada entrada. Cada entrada e saída fica em movimentacoes_estoque com o saldo após ela.
 * Contas a receber e a pagar geradas por vendas e compras apontam para a origem.
 */
export class VendasEstoque1792300000000 implements MigrationInterface {
  name = 'VendasEstoque1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "produtos" ADD "estoque" numeric(14,3) NOT NULL DEFAULT 0`);

    await queryRunner.query(`CREATE TYPE "vendas_status_enum" AS ENUM ('ORCAMENTO', 'PEDIDO', 'FATURADA', 'CANCELADA')`);
    await queryRunner.query(`
      CREATE TABLE "vendas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "numero" integer NOT NULL,
        "cliente_id" uuid NOT NULL,
        "status" "vendas_status_enum" NOT NULL DEFAULT 'ORCAMENTO',
        "data_emissao" date NOT NULL,
        "data_faturamento" date,
        "parcelas" smallint NOT NULL DEFAULT 1,
        "primeiro_vencimento" date,
        "plano_conta_id" uuid,
        "centro_custo_id" uuid,
        "observacoes" varchar(500),
        "total" numeric(14,2) NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendas" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_vendas_parcelas" CHECK ("parcelas" BETWEEN 1 AND 120),
        CONSTRAINT "CHK_vendas_total" CHECK ("total" >= 0),
        CONSTRAINT "FK_vendas_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_vendas_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_vendas_plano_conta" FOREIGN KEY ("plano_conta_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_vendas_centro_custo" FOREIGN KEY ("centro_custo_id")
          REFERENCES "centros_custo"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_vendas_empresa_numero" ON "vendas" ("empresa_id", "numero")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendas_empresa_status" ON "vendas" ("empresa_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_vendas_cliente" ON "vendas" ("cliente_id")`);

    await queryRunner.query(`
      CREATE TABLE "itens_venda" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "venda_id" uuid NOT NULL,
        "produto_id" uuid NOT NULL,
        "ordem" smallint NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "quantidade" numeric(14,3) NOT NULL,
        "preco_unitario" numeric(14,2) NOT NULL,
        "desconto" numeric(14,2) NOT NULL DEFAULT 0,
        "total" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_itens_venda" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_itens_venda_valores"
          CHECK ("quantidade" > 0 AND "preco_unitario" >= 0 AND "desconto" >= 0 AND "total" >= 0),
        CONSTRAINT "FK_itens_venda_venda" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_itens_venda_produto" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_itens_venda_venda" ON "itens_venda" ("venda_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_itens_venda_produto" ON "itens_venda" ("produto_id")`);

    await queryRunner.query(`CREATE TYPE "compras_status_enum" AS ENUM ('PEDIDO', 'RECEBIDA', 'CANCELADA')`);
    await queryRunner.query(`
      CREATE TABLE "compras" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "numero" integer NOT NULL,
        "fornecedor_id" uuid NOT NULL,
        "status" "compras_status_enum" NOT NULL DEFAULT 'PEDIDO',
        "data_emissao" date NOT NULL,
        "data_recebimento" date,
        "parcelas" smallint NOT NULL DEFAULT 1,
        "primeiro_vencimento" date,
        "plano_conta_id" uuid,
        "centro_custo_id" uuid,
        "observacoes" varchar(500),
        "total" numeric(14,2) NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_compras" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_compras_parcelas" CHECK ("parcelas" BETWEEN 1 AND 120),
        CONSTRAINT "CHK_compras_total" CHECK ("total" >= 0),
        CONSTRAINT "FK_compras_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_compras_fornecedor" FOREIGN KEY ("fornecedor_id")
          REFERENCES "fornecedores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_compras_plano_conta" FOREIGN KEY ("plano_conta_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_compras_centro_custo" FOREIGN KEY ("centro_custo_id")
          REFERENCES "centros_custo"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_compras_empresa_numero" ON "compras" ("empresa_id", "numero")`);
    await queryRunner.query(`CREATE INDEX "IDX_compras_empresa_status" ON "compras" ("empresa_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_compras_fornecedor" ON "compras" ("fornecedor_id")`);

    await queryRunner.query(`
      CREATE TABLE "itens_compra" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "compra_id" uuid NOT NULL,
        "produto_id" uuid NOT NULL,
        "ordem" smallint NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "quantidade" numeric(14,3) NOT NULL,
        "custo_unitario" numeric(14,2) NOT NULL,
        "total" numeric(14,2) NOT NULL,
        CONSTRAINT "PK_itens_compra" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_itens_compra_valores" CHECK ("quantidade" > 0 AND "custo_unitario" >= 0 AND "total" >= 0),
        CONSTRAINT "FK_itens_compra_compra" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_itens_compra_produto" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_itens_compra_compra" ON "itens_compra" ("compra_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_itens_compra_produto" ON "itens_compra" ("produto_id")`);

    await queryRunner.query(`CREATE TYPE "movimentacoes_estoque_tipo_enum" AS ENUM ('ENTRADA', 'SAIDA')`);
    await queryRunner.query(`
      CREATE TYPE "movimentacoes_estoque_origem_enum"
        AS ENUM ('COMPRA', 'VENDA', 'AJUSTE', 'ESTORNO_COMPRA', 'ESTORNO_VENDA')
    `);
    await queryRunner.query(`
      CREATE TABLE "movimentacoes_estoque" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL,
        "produto_id" uuid NOT NULL,
        "data" date NOT NULL,
        "tipo" "movimentacoes_estoque_tipo_enum" NOT NULL,
        "origem" "movimentacoes_estoque_origem_enum" NOT NULL,
        "quantidade" numeric(14,3) NOT NULL,
        "custo_unitario" numeric(14,2) NOT NULL,
        "saldo" numeric(14,3) NOT NULL,
        "descricao" varchar(255) NOT NULL,
        "venda_id" uuid,
        "compra_id" uuid,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "seq" bigserial NOT NULL,
        CONSTRAINT "PK_movimentacoes_estoque" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_movimentacoes_estoque_valores" CHECK ("quantidade" > 0 AND "custo_unitario" >= 0),
        CONSTRAINT "FK_movimentacoes_estoque_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_estoque_produto" FOREIGN KEY ("produto_id")
          REFERENCES "produtos"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_estoque_venda" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_movimentacoes_estoque_compra" FOREIGN KEY ("compra_id")
          REFERENCES "compras"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_movimentacoes_estoque_produto_seq" ON "movimentacoes_estoque" ("produto_id", "seq")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_movimentacoes_estoque_venda" ON "movimentacoes_estoque" ("venda_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_movimentacoes_estoque_compra" ON "movimentacoes_estoque" ("compra_id")`);

    await queryRunner.query(`
      ALTER TABLE "contas_receber" ADD "venda_id" uuid,
        ADD CONSTRAINT "FK_contas_receber_venda" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_contas_receber_venda" ON "contas_receber" ("venda_id")`);
    await queryRunner.query(`
      ALTER TABLE "contas_pagar" ADD "compra_id" uuid,
        ADD CONSTRAINT "FK_contas_pagar_compra" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_contas_pagar_compra" ON "contas_pagar" ("compra_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_contas_pagar_compra"`);
    await queryRunner.query(`ALTER TABLE "contas_pagar" DROP CONSTRAINT "FK_contas_pagar_compra", DROP COLUMN "compra_id"`);
    await queryRunner.query(`DROP INDEX "IDX_contas_receber_venda"`);
    await queryRunner.query(`ALTER TABLE "contas_receber" DROP CONSTRAINT "FK_contas_receber_venda", DROP COLUMN "venda_id"`);
    await queryRunner.query(`DROP TABLE "movimentacoes_estoque"`);
    await queryRunner.query(`DROP TYPE "movimentacoes_estoque_origem_enum"`);
    await queryRunner.query(`DROP TYPE "movimentacoes_estoque_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "itens_compra"`);
    await queryRunner.query(`DROP TABLE "compras"`);
    await queryRunner.query(`DROP TYPE "compras_status_enum"`);
    await queryRunner.query(`DROP TABLE "itens_venda"`);
    await queryRunner.query(`DROP TABLE "vendas"`);
    await queryRunner.query(`DROP TYPE "vendas_status_enum"`);
    await queryRunner.query(`ALTER TABLE "produtos" DROP COLUMN "estoque"`);
  }
}
