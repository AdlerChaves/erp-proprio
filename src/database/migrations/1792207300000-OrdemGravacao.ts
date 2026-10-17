import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sequência de gravação em baixas e movimentações, para desempatar registros do mesmo dia
 * sem depender do relógio do servidor, que pode ser ajustado para trás.
 */
export class OrdemGravacao1792207300000 implements MigrationInterface {
  name = 'OrdemGravacao1792207300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "baixas" ADD "seq" bigserial NOT NULL`);
    await queryRunner.query(`ALTER TABLE "movimentacoes_bancarias" ADD "seq" bigserial NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "movimentacoes_bancarias" DROP COLUMN "seq"`);
    await queryRunner.query(`ALTER TABLE "baixas" DROP COLUMN "seq"`);
  }
}
