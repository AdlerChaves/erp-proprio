import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from './cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(@InjectRepository(Cliente) private readonly repo: Repository<Cliente>) {}

  findAll(empresaId: string) {
    return this.repo.find({ where: { empresaId }, order: { nome: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const cliente = await this.repo.findOneBy({ id, empresaId });
    if (!cliente) throw new NotFoundException(`Cliente ${id} não encontrado`);
    return cliente;
  }

  async create(empresaId: string, dto: CreateClienteDto) {
    await this.ensureDocumentoLivre(empresaId, dto.documento);
    return this.repo.save(this.repo.create({ ...dto, empresaId }));
  }

  async update(empresaId: string, id: string, dto: UpdateClienteDto) {
    const cliente = await this.findOne(empresaId, id);
    if (dto.documento && dto.documento !== cliente.documento) {
      await this.ensureDocumentoLivre(empresaId, dto.documento);
    }
    return this.repo.save(this.repo.merge(cliente, dto));
  }

  async remove(empresaId: string, id: string) {
    const cliente = await this.findOne(empresaId, id);
    await this.repo.remove(cliente);
  }

  private async ensureDocumentoLivre(empresaId: string, documento: string) {
    if (await this.repo.existsBy({ empresaId, documento })) {
      throw new ConflictException(`Já existe cliente com documento ${documento}`);
    }
  }
}
