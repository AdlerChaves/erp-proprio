import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { FiltroProdutoDto } from './dto/filtro-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';
import { Produto, TipoProduto } from './produto.entity';

@Injectable()
export class ProdutosService {
  constructor(@InjectRepository(Produto) private readonly repo: Repository<Produto>) {}

  findAll(empresaId: string, filtro: FiltroProdutoDto) {
    return this.repo.find({ where: { empresaId, tipo: filtro.tipo }, order: { descricao: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const produto = await this.repo.findOneBy({ id, empresaId });
    if (!produto) throw new NotFoundException(`Produto ${id} não encontrado`);
    return produto;
  }

  async create(empresaId: string, dto: CreateProdutoDto) {
    await this.ensureCodigoLivre(empresaId, dto.codigo);
    const produto = this.repo.create({ ...dto, empresaId });
    this.validarCamposFiscais(produto);
    return this.repo.save(produto);
  }

  async update(empresaId: string, id: string, dto: UpdateProdutoDto) {
    const produto = await this.findOne(empresaId, id);
    if (dto.codigo && dto.codigo !== produto.codigo) {
      await this.ensureCodigoLivre(empresaId, dto.codigo);
    }
    this.repo.merge(produto, dto);
    this.validarCamposFiscais(produto);
    return this.repo.save(produto);
  }

  async remove(empresaId: string, id: string) {
    const produto = await this.findOne(empresaId, id);
    await this.repo.remove(produto);
  }

  private validarCamposFiscais(produto: Produto) {
    if (produto.tipo === TipoProduto.PRODUTO && produto.codigoServico) {
      throw new BadRequestException('codigoServico só se aplica a serviços');
    }
    if (produto.tipo === TipoProduto.SERVICO && produto.ncm) {
      throw new BadRequestException('ncm só se aplica a produtos');
    }
  }

  private async ensureCodigoLivre(empresaId: string, codigo: string) {
    if (await this.repo.existsBy({ empresaId, codigo })) {
      throw new ConflictException(`Já existe produto com código ${codigo}`);
    }
  }
}
