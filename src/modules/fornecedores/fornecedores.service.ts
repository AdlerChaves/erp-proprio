import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';
import { Fornecedor } from './fornecedor.entity';

@Injectable()
export class FornecedoresService {
  constructor(@InjectRepository(Fornecedor) private readonly repo: Repository<Fornecedor>) {}

  findAll(empresaId: string) {
    return this.repo.find({ where: { empresaId }, order: { nome: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const fornecedor = await this.repo.findOneBy({ id, empresaId });
    if (!fornecedor) throw new NotFoundException(`Fornecedor ${id} não encontrado`);
    return fornecedor;
  }

  async create(empresaId: string, dto: CreateFornecedorDto) {
    await this.ensureDocumentoLivre(empresaId, dto.documento);
    return this.repo.save(this.repo.create({ ...dto, empresaId }));
  }

  async update(empresaId: string, id: string, dto: UpdateFornecedorDto) {
    const fornecedor = await this.findOne(empresaId, id);
    if (dto.documento && dto.documento !== fornecedor.documento) {
      await this.ensureDocumentoLivre(empresaId, dto.documento);
    }
    return this.repo.save(this.repo.merge(fornecedor, dto));
  }

  async remove(empresaId: string, id: string) {
    const fornecedor = await this.findOne(empresaId, id);
    await this.repo.remove(fornecedor);
  }

  private async ensureDocumentoLivre(empresaId: string, documento: string) {
    if (await this.repo.existsBy({ empresaId, documento })) {
      throw new ConflictException(`Já existe fornecedor com documento ${documento}`);
    }
  }
}
