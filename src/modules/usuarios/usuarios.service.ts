import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { gerarHashSenha } from '../auth/senha';
import { AdicionarUsuarioDto } from './dto/adicionar-usuario.dto';
import { AtualizarAcessoDto } from './dto/atualizar-acesso.dto';
import { Perfil } from './perfil.enum';
import { UsuarioEmpresa } from './usuario-empresa.entity';
import { Usuario } from './usuario.entity';

const exibir = (v: UsuarioEmpresa) => ({
  id: v.usuario.id,
  nome: v.usuario.nome,
  email: v.usuario.email,
  perfil: v.perfil,
  ativo: v.ativo && v.usuario.ativo,
});

@Injectable()
export class UsuariosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UsuarioEmpresa) private readonly vinculos: Repository<UsuarioEmpresa>,
  ) {}

  async listar(empresaId: string) {
    const vinculos = await this.vinculos.find({
      where: { empresaId },
      relations: { usuario: true },
      order: { usuario: { nome: 'ASC' } },
    });
    return vinculos.map(exibir);
  }

  /** Dá acesso à empresa a um usuário existente ou cria a conta dele. */
  async adicionar(empresaId: string, dto: AdicionarUsuarioDto) {
    const usuarioId = await this.dataSource.transaction(async (m) => {
      let usuario = await m.findOneBy(Usuario, { email: dto.email });
      if (usuario) {
        if (await m.existsBy(UsuarioEmpresa, { usuarioId: usuario.id, empresaId })) {
          throw new ConflictException(`${dto.email} já tem acesso a esta empresa`);
        }
      } else {
        if (!dto.nome || !dto.senha) {
          throw new BadRequestException('nome e senha são obrigatórios para um usuário novo');
        }
        usuario = await m.save(
          m.create(Usuario, { nome: dto.nome, email: dto.email, senhaHash: await gerarHashSenha(dto.senha) }),
        );
      }
      await m.save(m.create(UsuarioEmpresa, { usuarioId: usuario.id, empresaId, perfil: dto.perfil }));
      return usuario.id;
    });
    return exibir(await this.findVinculo(empresaId, usuarioId));
  }

  async atualizarAcesso(empresaId: string, usuarioId: string, dto: AtualizarAcessoDto) {
    const vinculo = await this.findVinculo(empresaId, usuarioId);
    const deixaDeSerAdmin =
      vinculo.perfil === Perfil.ADMIN &&
      vinculo.ativo &&
      ((dto.perfil && dto.perfil !== Perfil.ADMIN) || dto.ativo === false);
    if (deixaDeSerAdmin) {
      const admins = await this.vinculos.countBy({ empresaId, perfil: Perfil.ADMIN, ativo: true });
      if (admins <= 1) {
        throw new BadRequestException('A empresa precisa de pelo menos um administrador ativo');
      }
    }
    await this.vinculos.save(this.vinculos.merge(vinculo, dto));
    return exibir(vinculo);
  }

  private async findVinculo(empresaId: string, usuarioId: string) {
    const vinculo = await this.vinculos.findOne({
      where: { empresaId, usuarioId },
      relations: { usuario: true },
    });
    if (!vinculo) throw new NotFoundException(`Usuário ${usuarioId} não tem acesso a esta empresa`);
    return vinculo;
  }
}
