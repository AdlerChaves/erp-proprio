import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service';
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

/** Senhas erradas seguidas que bloqueiam a conta. */
export const MAXIMO_TENTATIVAS_LOGIN = 5;
export const MINUTOS_BLOQUEIO = 15;

/** A mesma resposta para e-mail inexistente, senha errada e conta bloqueada, para não revelar quais contas existem. */
export const MENSAGEM_LOGIN_RECUSADO = 'E-mail ou senha inválidos, ou acesso bloqueado temporariamente por excesso de tentativas';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly auditoria: AuditoriaService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(UsuarioEmpresa) private readonly vinculos: Repository<UsuarioEmpresa>,
  ) {}

  /** Cadastro inicial: cria a empresa e o usuário administrador dela. */
  async registrar(dto: RegistrarDto, ip: string) {
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
    await this.auditoria.registrar({ empresaId, usuarioId, acao: 'REGISTRO', recurso: 'empresas', recursoId: empresaId, ip });
    return this.emitirToken(usuarioId, empresaId, 1);
  }

  /**
   * Depois de MAXIMO_TENTATIVAS_LOGIN senhas erradas seguidas, a conta fica bloqueada por MINUTOS_BLOQUEIO,
   * mesmo para a senha certa. A resposta é a mesma em todos os casos de recusa.
   */
  async login(dto: LoginDto, ip: string) {
    const usuario = await this.usuarios.findOne({
      where: { email: dto.email },
      select: { id: true, ativo: true, senhaHash: true, tokenVersao: true, tentativasLogin: true, bloqueadoAte: true },
    });
    const senhaOk = await verificarSenha(dto.senha, usuario?.senhaHash ?? (await obterHashFicticio()));
    const bloqueado = !!usuario?.bloqueadoAte && usuario.bloqueadoAte > new Date();

    if (!usuario || !usuario.ativo || bloqueado || !senhaOk) {
      if (usuario && usuario.ativo && !bloqueado) {
        await this.registrarSenhaErrada(usuario.id, ip);
      } else {
        await this.auditoria.registrar({
          usuarioId: usuario?.id ?? null,
          acao: bloqueado ? 'LOGIN_RECUSADO_BLOQUEIO' : 'LOGIN_FALHOU',
          dados: usuario ? null : { email: dto.email },
          ip,
        });
      }
      throw new UnauthorizedException(MENSAGEM_LOGIN_RECUSADO);
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

    if (usuario.tentativasLogin || usuario.bloqueadoAte) {
      await this.usuarios.update(usuario.id, { tentativasLogin: 0, bloqueadoAte: null });
    }
    await this.auditoria.registrar({ empresaId, usuarioId: usuario.id, acao: 'LOGIN', ip });
    return this.emitirToken(usuario.id, empresaId, usuario.tokenVersao);
  }

  async trocarEmpresa(sessao: Sessao, empresaId: string) {
    const empresas = await this.empresasDoUsuario(sessao.usuarioId);
    if (!empresas.some((e) => e.id === empresaId)) {
      throw new UnauthorizedException('Sem acesso a esta empresa');
    }
    return this.emitirToken(sessao.usuarioId, empresaId, sessao.tokenVersao);
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

  /** Troca a senha e invalida todos os tokens emitidos antes; devolve um token novo para a sessão atual. */
  async alterarSenha(sessao: Sessao, dto: AlterarSenhaDto) {
    const usuario = await this.usuarios.findOneOrFail({
      where: { id: sessao.usuarioId },
      select: { id: true, senhaHash: true, tokenVersao: true },
    });
    if (!(await verificarSenha(dto.senhaAtual, usuario.senhaHash))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    const tokenVersao = usuario.tokenVersao + 1;
    await this.usuarios.update(usuario.id, { senhaHash: await gerarHashSenha(dto.novaSenha), tokenVersao });
    return this.emitirToken(usuario.id, sessao.empresaId, tokenVersao);
  }

  /** Invalida todos os tokens do usuário, inclusive o desta requisição. */
  async encerrarSessoes(sessao: Sessao) {
    await this.usuarios.increment({ id: sessao.usuarioId }, 'tokenVersao', 1);
  }

  /** Conta a senha errada de forma atômica e bloqueia a conta ao atingir o limite. */
  private async registrarSenhaErrada(usuarioId: string, ip: string) {
    const resultado = await this.usuarios
      .createQueryBuilder()
      .update()
      .set({ tentativasLogin: () => 'tentativas_login + 1' })
      .where('id = :usuarioId', { usuarioId })
      .returning('tentativas_login')
      .execute();
    const tentativas = Number(resultado.raw[0].tentativas_login);

    if (tentativas >= MAXIMO_TENTATIVAS_LOGIN) {
      await this.usuarios.update(usuarioId, {
        tentativasLogin: 0,
        bloqueadoAte: new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000),
      });
      await this.auditoria.registrar({ usuarioId, acao: 'CONTA_BLOQUEADA', dados: { tentativas }, ip });
    } else {
      await this.auditoria.registrar({ usuarioId, acao: 'LOGIN_FALHOU', dados: { tentativas }, ip });
    }
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

  private async emitirToken(usuarioId: string, empresaId: string, tokenVersao: number) {
    const payload: TokenPayload = { sub: usuarioId, empresaId, ver: tokenVersao };
    return { accessToken: await this.jwt.signAsync(payload), empresaId };
  }
}
