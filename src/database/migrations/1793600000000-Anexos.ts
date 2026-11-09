import { MigrationInterface, QueryRunner } from 'typeorm';

/** Anexos (boletos, notas fiscais, comprovantes) das contas a pagar e a receber, com o arquivo no próprio banco. */
export class Anexos1793600000000 implements MigrationInterface {
  name = 'Anexos1793600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "anexos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "empresa_id" uuid NOT NULL, "conta_pagar_id" uuid, "conta_receber_id" uuid, "nome" character varying(200) NOT NULL, "tipo" character varying(50) NOT NULL, "tamanho" integer NOT NULL, "conteudo" bytea NOT NULL, "enviado_por_id" uuid, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_anexos_tamanho" CHECK ("tamanho" > 0), CONSTRAINT "CHK_anexos_uma_conta" CHECK (num_nonnulls("conta_pagar_id", "conta_receber_id") = 1), CONSTRAINT "PK_anexos" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_anexos_conta_receber" ON "anexos" ("conta_receber_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_anexos_conta_pagar" ON "anexos" ("conta_pagar_id") `);
    await queryRunner.query(`ALTER TABLE "anexos" ADD CONSTRAINT "FK_anexos_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "anexos" ADD CONSTRAINT "FK_anexos_conta_pagar" FOREIGN KEY ("conta_pagar_id") REFERENCES "contas_pagar"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "anexos" ADD CONSTRAINT "FK_anexos_conta_receber" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "anexos" ADD CONSTRAINT "FK_anexos_enviado_por" FOREIGN KEY ("enviado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "anexos" DROP CONSTRAINT "FK_anexos_enviado_por"`);
    await queryRunner.query(`ALTER TABLE "anexos" DROP CONSTRAINT "FK_anexos_conta_receber"`);
    await queryRunner.query(`ALTER TABLE "anexos" DROP CONSTRAINT "FK_anexos_conta_pagar"`);
    await queryRunner.query(`ALTER TABLE "anexos" DROP CONSTRAINT "FK_anexos_empresa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_anexos_conta_pagar"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_anexos_conta_receber"`);
    await queryRunner.query(`DROP TABLE "anexos"`);
  }
}
