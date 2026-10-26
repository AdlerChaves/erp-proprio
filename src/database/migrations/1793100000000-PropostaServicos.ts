import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Orçamento com produtos e serviços: escopo do serviço (só mão de obra ou material incluso) e a escolha de mostrar
 * o parcelamento no cartão, por venda; foto opcional do produto.
 */
export class PropostaServicos1793100000000 implements MigrationInterface {
  name = 'PropostaServicos1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "vendas_escopo_servico_enum" AS ENUM ('MAO_DE_OBRA', 'MATERIAL_INCLUSO')`);
    await queryRunner.query(
      `ALTER TABLE "vendas" ADD "escopo_servico" "vendas_escopo_servico_enum", ADD "exibir_parcelamento" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`ALTER TABLE "produtos" ADD "imagem" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "produtos" DROP COLUMN "imagem"`);
    await queryRunner.query(`ALTER TABLE "vendas" DROP COLUMN "exibir_parcelamento", DROP COLUMN "escopo_servico"`);
    await queryRunner.query(`DROP TYPE "vendas_escopo_servico_enum"`);
  }
}
