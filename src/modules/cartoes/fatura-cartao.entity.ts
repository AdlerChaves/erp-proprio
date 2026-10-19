import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Empresa } from '../empresas/empresa.entity';
import { CartaoCredito } from './cartao-credito.entity';

export enum StatusFatura {
  /** Recebe lançamentos; as datas podem ser ajustadas. */
  ABERTA = 'ABERTA',
  /** Conferida com o banco: total e datas não mudam mais (pode ser reaberta enquanto não houver pagamento). */
  FECHADA = 'FECHADA',
}

/** Fatura de um mês, identificada pelo mês do vencimento (competência AAAA-MM). */
@Entity('faturas_cartao')
@Check('CHK_faturas_cartao_datas', '"data_fechamento" <= "data_vencimento"')
@Index('UQ_faturas_cartao_cartao_competencia', ['cartaoId', 'competencia'], { unique: true })
export class FaturaCartao {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_faturas_cartao' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_faturas_cartao_empresa' })
  empresa: Empresa;

  @Column({ name: 'cartao_id', type: 'uuid' })
  cartaoId: string;

  @ManyToOne(() => CartaoCredito, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cartao_id', foreignKeyConstraintName: 'FK_faturas_cartao_cartao' })
  cartao: CartaoCredito;

  /** Mês do vencimento, AAAA-MM. */
  @Column({ length: 7 })
  competencia: string;

  /** Compras até a véspera desta data entram nesta fatura. */
  @Column({ name: 'data_fechamento', type: 'date' })
  dataFechamento: string;

  @Column({ name: 'data_vencimento', type: 'date' })
  dataVencimento: string;

  /** Datas mudadas à mão (feriado, fim de semana): não acompanham mais os dias padrão do cartão. */
  @Column({ name: 'datas_ajustadas', default: false })
  datasAjustadas: boolean;

  @Column({ type: 'enum', enum: StatusFatura, default: StatusFatura.ABERTA })
  status: StatusFatura;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm: Date;
}
