import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContaReceber } from '../contas-receber/conta-receber.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Usuario } from '../usuarios/usuario.entity';

/** Arquivo (boleto, nota fiscal, comprovante) guardado junto de uma conta a pagar ou a receber. */
@Entity('anexos')
@Index('IDX_anexos_conta_pagar', ['contaPagarId'])
@Index('IDX_anexos_conta_receber', ['contaReceberId'])
@Check('CHK_anexos_uma_conta', 'num_nonnulls("conta_pagar_id", "conta_receber_id") = 1')
@Check('CHK_anexos_tamanho', '"tamanho" > 0')
export class Anexo {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_anexos' })
  id: string;

  @Column({ name: 'empresa_id', type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_anexos_empresa' })
  empresa: Empresa;

  @Column({ name: 'conta_pagar_id', type: 'uuid', nullable: true })
  contaPagarId: string | null;

  @ManyToOne(() => ContaPagar, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_pagar_id', foreignKeyConstraintName: 'FK_anexos_conta_pagar' })
  contaPagar: ContaPagar | null;

  @Column({ name: 'conta_receber_id', type: 'uuid', nullable: true })
  contaReceberId: string | null;

  @ManyToOne(() => ContaReceber, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'conta_receber_id', foreignKeyConstraintName: 'FK_anexos_conta_receber' })
  contaReceber: ContaReceber | null;

  /** Nome já limpo (sem diretórios nem caracteres de controle), terminando na extensão do tipo real. */
  @Column({ length: 200 })
  nome: string;

  /** Tipo MIME detectado pelo conteúdo do arquivo, não pelo que o navegador informou. */
  @Column({ length: 50 })
  tipo: string;

  /** Em bytes. */
  @Column({ type: 'integer' })
  tamanho: number;

  /** Fica fora das consultas comuns: só o download o carrega. */
  @Column({ type: 'bytea', select: false })
  conteudo: Buffer;

  @Column({ name: 'enviado_por_id', type: 'uuid', nullable: true })
  enviadoPorId: string | null;

  @ManyToOne(() => Usuario, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'enviado_por_id', foreignKeyConstraintName: 'FK_anexos_enviado_por' })
  enviadoPor: Usuario | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
