import { MigrationInterface, QueryRunner } from 'typeorm';

/** Contato da empresa (telefone, e-mail e endereço) para o cabeçalho de orçamentos e pedidos. */
export class ContatoEmpresa1792700000000 implements MigrationInterface {
  name = 'ContatoEmpresa1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" ADD "telefone" varchar(20), ADD "email" varchar(150), ADD "endereco" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "endereco", DROP COLUMN "email", DROP COLUMN "telefone"`);
  }
}
