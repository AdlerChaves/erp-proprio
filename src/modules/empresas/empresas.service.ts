import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { criarPlanoPadrao } from '../plano-contas/plano-padrao';
import { Perfil } from '../usuarios/perfil.enum';
import { UsuarioEmpresa } from '../usuarios/usuario-empresa.entity';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Empresa } from './empresa.entity';

@Injectable()
export class EmpresasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Empresa) private readonly repo: Repository<Empresa>,
  ) {}

  async findOne(id: string) {
    const empresa = await this.repo.findOneBy({ id });
    if (!empresa) throw new NotFoundException(`Empresa ${id} não encontrada`);
    return empresa;
  }

  async update(id: string, dto: UpdateEmpresaDto) {
    if (dto.nfseSerie && Number(dto.nfseSerie) > 49999) {
      throw new BadRequestException('A série da DPS para aplicativo próprio vai de 1 a 49999');
    }
    const empresa = await this.findOne(id);
    return this.repo.save(this.repo.merge(empresa, dto));
  }

  /** Cria a empresa com o plano de contas padrão e torna o usuário seu administrador. */
  criarParaUsuario(usuarioId: string, dto: CreateEmpresaDto) {
    return this.dataSource.transaction(async (m) => {
      if (await m.existsBy(Empresa, { cnpj: dto.cnpj })) {
        throw new ConflictException(`Já existe empresa com CNPJ ${dto.cnpj}`);
      }
      const empresa = await m.save(m.create(Empresa, dto));
      await criarPlanoPadrao(m, empresa.id);
      await m.save(m.create(UsuarioEmpresa, { usuarioId, empresaId: empresa.id, perfil: Perfil.ADMIN }));
      return empresa;
    });
  }
}
