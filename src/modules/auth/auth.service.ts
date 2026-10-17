import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Empresa } from '../empresas/empresa.entity';
import { criarPlanoPadrao } from '../plano-contas/plano-padrao';
import { Perfil } from '../usuarios/perfil.enum';
import { UsuarioEmpresa } from '../usuarios/usuario-empresa.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { AlterarSenhaDto } from './dto/alterar-senha.dto';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { Sessao, TokenPayload } from './sessao';
import { gerarHashSenha, obterHashFicticio, verificarSenha } from './senha';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioEmpresa) private readonly vinculos: Repository<UsuarioEmpresa>,
  ) {}

  /** Cadastro inicial: cria a empresa e o usuário administrador dela. */
  async registrar(dto: RegistrarDto) {
    const { usuarioId, empresaId } = await this.dataSource.transaction(async (m) => {
      if (await m.existsBy(Usuario, { email: dto.usuario.email })) {
        throw new ConflictException(
          'E-mail já cadastrado. Faça login e crie a nova empresa em POST /api/empresas',
        );
      }
      if (await m.existsBy(Empresa, { cnpj: dto.empresa.cnpj })) {
        throw new ConflictException(`Já existe empresa com CNPJ ${dto.empresa.cnpj}`);
      }
      const empresa = await m.save(m.create(Empresa, dto.empresa));
      await criarPlanoPadrao(m, empresa.id);
      const usuario = await m.save(
        m.create(Usuario, {
          nome: dto.usuario.nome,
          email: dto.usuario.email,
          senhaHash: await gerarHashSenha(dto.usuario.senha),
        }),
      );
      await m.save(
        m.create(UsuarioEmpresa, { usuarioId: usuario.id, empresaId: empresa.id, perfil: Perfil.ADMIN }),
      );
      return { usuarioId: usuario.id, empresaId: empresa.id };
    });
    return this.emitirToken(usuarioId, empresaId);
  }

  async login(dto: LoginDto) {
    const usuario = await this.usuarios.findOne({
      where: { email: dto.email },
      select: { id: true, ativo: true, senhaHash: true },
    });
    const senhaOk = await verificarSenha(dto.senha, usuario?.senhaHash ?? (await obterHashFicticio()));
    if (!usuario || !senhaOk || !usuario.ativo) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const empresas = await this.empresasDoUsuario(usuario.id);
    if (empresas.length === 0) throw new UnauthorizedException('Usuário sem acesso a nenhuma empresa');

    let empresaId = dto.empresaId;
    if (!empresaId) {
      if (empresas.length > 1) {
        throw new BadRequestException({ message: 'Informe empresaId', empresas });
      }
      empresaId = empresas[0].id;
    }
    if (!empresas.some((e) => e.id === empresaId)) {
      throw new UnauthorizedException('Sem acesso a esta empresa');
    }
    return this.emitirToken(usuario.id, empresaId);
  }

  async trocarEmpresa(sessao: Sessao, empresaId: string) {
    const empresas = await this.empresasDoUsuario(sessao.usuarioId);
    if (!empresas.some((e) => e.id === empresaId)) {
      throw new UnauthorizedException('Sem acesso a esta empresa');
    }
    return this.emitirToken(sessao.usuarioId, empresaId);
  }

  async me(sessao: Sessao) {
    const usuario = await this.usuarios.findOneByOrFail({ id: sessao.usuarioId });
    return {
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      empresaId: sessao.empresaId,
      perfil: sessao.perfil,
      empresas: await this.empresasDoUsuario(sessao.usuarioId),
    };
  }

  async alterarSenha(sessao: Sessao, dto: AlterarSenhaDto) {
    const usuario = await this.usuarios.findOneOrFail({
      where: { id: sessao.usuarioId },
      select: { id: true, senhaHash: true },
    });
    if (!(await verificarSenha(dto.senhaAtual, usuario.senhaHash))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    await this.usuarios.update(usuario.id, { senhaHash: await gerarHashSenha(dto.novaSenha) });
  }

  private async empresasDoUsuario(usuarioId: string) {
    const vinculos = await this.vinculos.find({
      where: { usuarioId, ativo: true, empresa: { ativo: true } },
      relations: { empresa: true },
      order: { empresa: { razaoSocial: 'ASC' } },
    });
    return vinculos.map((v) => ({
      id: v.empresa.id,
      razaoSocial: v.empresa.razaoSocial,
      nomeFantasia: v.empresa.nomeFantasia,
      perfil: v.perfil,
    }));
  }

  private async emitirToken(usuarioId: string, empresaId: string) {
    const payload: TokenPayload = { sub: usuarioId, empresaId };
    return { accessToken: await this.jwt.signAsync(payload), empresaId };
  }
}
