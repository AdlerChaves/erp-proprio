import { MigrationInterface, QueryRunner } from 'typeorm';

/** O CPF/CNPJ do cliente passa a ser opcional (proposta antes de receber os documentos). */
export class ClienteSemDocumento1792800000000 implements MigrationInterface {
  name = 'ClienteSemDocumento1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "documento" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Falha se houver cliente sem CPF/CNPJ: complete os cadastros antes de reverter.
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "documento" SET NOT NULL`);
  }
}
