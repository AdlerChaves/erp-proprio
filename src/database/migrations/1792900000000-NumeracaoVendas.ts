import { MigrationInterface, QueryRunner } from 'typeorm';

/** Número a partir do qual a empresa numera orçamentos e vendas (padrão 1). */
export class NumeracaoVendas1792900000000 implements MigrationInterface {
  name = 'NumeracaoVendas1792900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" ADD "numero_inicial_vendas" integer NOT NULL DEFAULT 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "numero_inicial_vendas"`);
  }
}
