import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuração da proposta em PDF (destaques, validade, parcelamento no cartão) e logo da empresa.
 * Sem configuração (nulo), vale o padrão do código: validade de 10 dias e cartão em até 12x com 2% ao mês.
 */
export class PropostaPdf1793000000000 implements MigrationInterface {
  name = 'PropostaPdf1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empresas" ADD "proposta" jsonb, ADD "logo" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "logo", DROP COLUMN "proposta"`);
  }
}
