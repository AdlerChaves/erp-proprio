import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { Empresa } from '../empresas/empresa.entity';

export enum TipoContaBancaria {
  CORRENTE = 'CORRENTE',
  POUPANCA = 'POUPANCA',
  INVESTIMENTO = 'INVESTIMENTO',
  /** Dinheiro em espécie: não tem banco, agência nem número. */
  CAIXA = 'CAIXA',
}

@Entity('contas_bancarias')
@Index('UQ_contas_bancarias_empresa_nome', ['empresaId', 'nome'], { unique: true })
export class ContaBancaria {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_contas_bancarias' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_contas_bancarias_empresa' })
  empresa: Empresa;

  /** Apelido, ex.: "Itaú movimento" ou "Caixa da loja". */
  @Column({ length: 100 })
  nome: string;

  @Column({ type: 'enum', enum: TipoContaBancaria })
  tipo: TipoContaBancaria;

  /** Código COMPE de 3 dígitos, ex.: 341. */
  @Column({ type: 'varchar', length: 3, nullable: true })
  banco: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  agencia: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  numero: string | null;

  @Column({ name: 'saldo_inicial', type: 'numeric', precision: 14, scale: 2, transformer: decimalTransformer })
  saldoInicial: number;

  @Column({ name: 'data_saldo_inicial', type: 'date' })
  dataSaldoInicial: string;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
