import { MigrationInterface, QueryRunner } from 'typeorm';

/** Emissão da NFS-e pelo Emissor Nacional: certificado A1 cifrado na empresa; XML da nota e último erro de envio. */
export class TransmissaoNfse1793200000000 implements MigrationInterface {
  name = 'TransmissaoNfse1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empresas" ADD "certificado_cifrado" text, ADD "certificado_titular" character varying(255), ADD "certificado_validade" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(`ALTER TABLE "notas_servico" ADD "xml_nfse" text, ADD "erro_transmissao" character varying(1000)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notas_servico" DROP COLUMN "erro_transmissao", DROP COLUMN "xml_nfse"`);
    await queryRunner.query(
      `ALTER TABLE "empresas" DROP COLUMN "certificado_validade", DROP COLUMN "certificado_titular", DROP COLUMN "certificado_cifrado"`,
    );
  }
}
