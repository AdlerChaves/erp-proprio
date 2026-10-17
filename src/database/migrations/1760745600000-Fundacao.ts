import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Empresas, usuários e acessos, e separação de clientes e contas a receber por empresa.
 * Falha se já houver clientes ou contas cadastrados, pois empresa_id é obrigatório.
 */
export class Fundacao1760745600000 implements MigrationInterface {
  name = 'Fundacao1760745600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "empresas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "razao_social" varchar(150) NOT NULL,
        "nome_fantasia" varchar(150),
        "cnpj" varchar(14) NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_empresas" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_empresas_cnpj" UNIQUE ("cnpj")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "nome" varchar(150) NOT NULL,
        "email" varchar(150) NOT NULL,
        "senha_hash" varchar(255) NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "atualizado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usuarios" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_usuarios_email" UNIQUE ("email")
      )
    `);
    await queryRunner.query(
      `CREATE TYPE "usuarios_empresas_perfil_enum" AS ENUM ('ADMIN', 'FINANCEIRO', 'VENDAS', 'CONSULTA')`,
    );
    await queryRunner.query(`
      CREATE TABLE "usuarios_empresas" (
        "usuario_id" uuid NOT NULL,
        "empresa_id" uuid NOT NULL,
        "perfil" "usuarios_empresas_perfil_enum" NOT NULL,
        "ativo" boolean NOT NULL DEFAULT true,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usuarios_empresas" PRIMARY KEY ("usuario_id", "empresa_id"),
        CONSTRAINT "FK_usuarios_empresas_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_usuarios_empresas_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_usuarios_empresas_empresa" ON "usuarios_empresas" ("empresa_id")`,
    );

    await queryRunner.query(`ALTER TABLE "clientes" ADD "empresa_id" uuid NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "clientes" ADD CONSTRAINT "FK_clientes_empresa"
        FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`ALTER TABLE "clientes" DROP CONSTRAINT "UQ_clientes_documento"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_clientes_empresa_documento" ON "clientes" ("empresa_id", "documento")`,
    );

    await queryRunner.query(`ALTER TABLE "contas_receber" ADD "empresa_id" uuid NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "contas_receber" ADD CONSTRAINT "FK_contas_receber_empresa"
        FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`DROP INDEX "IDX_contas_receber_status_vencimento"`);
    await queryRunner.query(`
      CREATE INDEX "IDX_contas_receber_empresa_status_vencimento"
        ON "contas_receber" ("empresa_id", "status", "data_vencimento")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_contas_receber_empresa_status_vencimento"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_contas_receber_status_vencimento" ON "contas_receber" ("status", "data_vencimento")`,
    );
    await queryRunner.query(`ALTER TABLE "contas_receber" DROP CONSTRAINT "FK_contas_receber_empresa"`);
    await queryRunner.query(`ALTER TABLE "contas_receber" DROP COLUMN "empresa_id"`);

    await queryRunner.query(`DROP INDEX "UQ_clientes_empresa_documento"`);
    await queryRunner.query(
      `ALTER TABLE "clientes" ADD CONSTRAINT "UQ_clientes_documento" UNIQUE ("documento")`,
    );
    await queryRunner.query(`ALTER TABLE "clientes" DROP CONSTRAINT "FK_clientes_empresa"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "empresa_id"`);

    await queryRunner.query(`DROP TABLE "usuarios_empresas"`);
    await queryRunner.query(`DROP TYPE "usuarios_empresas_perfil_enum"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TABLE "empresas"`);
  }
}
