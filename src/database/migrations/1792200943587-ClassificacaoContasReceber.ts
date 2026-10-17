import { MigrationInterface, QueryRunner } from 'typeorm';

/** Categoria, centro de custo e conta bancária da baixa nas contas a receber. Todas opcionais no banco. */
export class ClassificacaoContasReceber1792200943587 implements MigrationInterface {
  name = 'ClassificacaoContasReceber1792200943587';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contas_receber"
        ADD "plano_conta_id" uuid,
        ADD "centro_custo_id" uuid,
        ADD "conta_bancaria_id" uuid,
        ADD CONSTRAINT "FK_contas_receber_plano_conta" FOREIGN KEY ("plano_conta_id")
          REFERENCES "plano_contas"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_contas_receber_centro_custo" FOREIGN KEY ("centro_custo_id")
          REFERENCES "centros_custo"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_contas_receber_conta_bancaria" FOREIGN KEY ("conta_bancaria_id")
          REFERENCES "contas_bancarias"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX "IDX_contas_receber_plano_conta" ON "contas_receber" ("plano_conta_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_contas_receber_centro_custo" ON "contas_receber" ("centro_custo_id")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_contas_receber_conta_bancaria" ON "contas_receber" ("conta_bancaria_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contas_receber"
        DROP COLUMN "conta_bancaria_id",
        DROP COLUMN "centro_custo_id",
        DROP COLUMN "plano_conta_id"
    `);
  }
}
