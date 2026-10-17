import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CentroCusto } from './centro-custo.entity';
import { CreateCentroCustoDto } from './dto/create-centro-custo.dto';
import { UpdateCentroCustoDto } from './dto/update-centro-custo.dto';

@Injectable()
export class CentrosCustoService {
  constructor(@InjectRepository(CentroCusto) private readonly repo: Repository<CentroCusto>) {}

  findAll(empresaId: string) {
    return this.repo.find({ where: { empresaId }, order: { nome: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const centro = await this.repo.findOneBy({ id, empresaId });
    if (!centro) throw new NotFoundException(`Centro de custo ${id} não encontrado`);
    return centro;
  }

  async create(empresaId: string, dto: CreateCentroCustoDto) {
    await this.ensureNomeLivre(empresaId, dto.nome);
    return this.repo.save(this.repo.create({ ...dto, empresaId }));
  }

  async update(empresaId: string, id: string, dto: UpdateCentroCustoDto) {
    const centro = await this.findOne(empresaId, id);
    if (dto.nome && dto.nome !== centro.nome) await this.ensureNomeLivre(empresaId, dto.nome);
    return this.repo.save(this.repo.merge(centro, dto));
  }

  async remove(empresaId: string, id: string) {
    const centro = await this.findOne(empresaId, id);
    await this.repo.remove(centro);
  }

  private async ensureNomeLivre(empresaId: string, nome: string) {
    if (await this.repo.existsBy({ empresaId, nome })) {
      throw new ConflictException(`Já existe centro de custo com nome ${nome}`);
    }
  }
}
