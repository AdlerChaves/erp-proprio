import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Empresa } from '../empresas/empresa.entity';
import { Perfil } from './perfil.enum';
import { Usuario } from './usuario.entity';

/** Acesso de um usuário a uma empresa, com o perfil que ele tem nela. */
@Entity('usuarios_empresas')
@Index('IDX_usuarios_empresas_empresa', ['empresaId'])
export class UsuarioEmpresa {
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid', primaryKeyConstraintName: 'PK_usuarios_empresas' })
  usuarioId: string;

  @PrimaryColumn({ name: 'empresa_id', type: 'uuid', primaryKeyConstraintName: 'PK_usuarios_empresas' })
  empresaId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id', foreignKeyConstraintName: 'FK_usuarios_empresas_usuario' })
  usuario: Usuario;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id', foreignKeyConstraintName: 'FK_usuarios_empresas_empresa' })
  empresa: Empresa;

  @Column({ type: 'enum', enum: Perfil })
  perfil: Perfil;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm: Date;
}
