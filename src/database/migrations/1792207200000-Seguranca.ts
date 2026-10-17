import { MigrationInterface, QueryRunner } from 'typeorm';

/** Bloqueio por senhas erradas, revogação de tokens e trilha de auditoria. */
export class Seguranca1792207200000 implements MigrationInterface {
  name = 'Seguranca1792207200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        ADD "token_versao" integer NOT NULL DEFAULT 1,
        ADD "tentativas_login" integer NOT NULL DEFAULT 0,
        ADD "bloqueado_ate" timestamptz
    `);
    await queryRunner.query(`
      CREATE TABLE "auditoria" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid,
        "usuario_id" uuid,
        "acao" varchar(150) NOT NULL,
        "recurso" varchar(60),
        "recurso_id" uuid,
        "dados" jsonb,
        "ip" varchar(45),
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        "seq" bigserial NOT NULL,
        CONSTRAINT "PK_auditoria" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_auditoria_empresa_criado" ON "auditoria" ("empresa_id", "criado_em")`);
    await queryRunner.query(`CREATE INDEX "IDX_auditoria_empresa_seq" ON "auditoria" ("empresa_id", "seq")`);
    await queryRunner.query(`CREATE INDEX "IDX_auditoria_usuario" ON "auditoria" ("usuario_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_auditoria_recurso" ON "auditoria" ("recurso", "recurso_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auditoria"`);
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        DROP COLUMN "bloqueado_ate",
        DROP COLUMN "tentativas_login",
        DROP COLUMN "token_versao"
    `);
  }
}
