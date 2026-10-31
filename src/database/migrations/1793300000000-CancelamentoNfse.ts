import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cancelamento da NFS-e por evento no Emissor Nacional: marca das notas emitidas pelo ERP e XML do evento. */
export class CancelamentoNfse1793300000000 implements MigrationInterface {
  name = 'CancelamentoNfse1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notas_servico" ADD "emitida_no_erp" boolean NOT NULL DEFAULT false, ADD "xml_cancelamento" text`);
    await queryRunner.query(`UPDATE "notas_servico" SET "emitida_no_erp" = true WHERE "xml_nfse" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notas_servico" DROP COLUMN "xml_cancelamento", DROP COLUMN "emitida_no_erp"`);
  }
}
