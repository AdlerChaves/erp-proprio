import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validarImagem } from '../../common/imagem';
import { EstoqueService } from '../estoque/estoque.service';
import { servicoNacional } from '../nfse/catalogos';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { FiltroProdutoDto } from './dto/filtro-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';
import { Produto, TipoProduto } from './produto.entity';

@Injectable()
export class ProdutosService {
  constructor(
    @InjectRepository(Produto) private readonly repo: Repository<Produto>,
    private readonly estoque: EstoqueService,
  ) {}

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
    if (dto.tipo === TipoProduto.SERVICO && produto.tipo === TipoProduto.PRODUTO && (await this.estoque.temMovimentacoes(empresaId, id))) {
      throw new BadRequestException(`${produto.descricao} já movimentou estoque e não pode virar serviço`);
    }
    this.repo.merge(produto, dto);
    this.validarCamposFiscais(produto);
    return this.repo.save(produto);
  }

  async imagem(empresaId: string, id: string) {
    const produto = await this.repo.findOne({ where: { id, empresaId }, select: { id: true, imagem: true } });
    if (!produto) throw new NotFoundException(`Produto ${id} não encontrado`);
    return { imagem: produto.imagem ?? null };
  }

  async definirImagem(empresaId: string, id: string, imagem: string) {
    validarImagem(imagem, 'a imagem');
    await this.findOne(empresaId, id);
    await this.repo.update(id, { imagem });
    return { imagem };
  }

  async removerImagem(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    await this.repo.update(id, { imagem: null });
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
    if (produto.tipo === TipoProduto.PRODUTO && (produto.codigoTributacaoNacional || produto.codigoNbs)) {
      throw new BadRequestException('codigoTributacaoNacional e codigoNbs só se aplicam a serviços');
    }
    if (produto.codigoTributacaoNacional) {
      if (!servicoNacional(produto.codigoTributacaoNacional)) {
        throw new BadRequestException(`O código de tributação nacional ${produto.codigoTributacaoNacional} não existe na lista nacional de serviços`);
      }
      // O código LC 116 (00.00) é o começo do código nacional: 01.07 → 0107xx.
      const item = produto.codigoServico?.replace('.', '');
      if (item && !produto.codigoTributacaoNacional.startsWith(item)) {
        throw new BadRequestException(`O código nacional ${produto.codigoTributacaoNacional} não corresponde ao item ${produto.codigoServico} da LC 116`);
      }
    }
  }

  private async ensureCodigoLivre(empresaId: string, codigo: string) {
    if (await this.repo.existsBy({ empresaId, codigo })) {
      throw new ConflictException(`Já existe produto com código ${codigo}`);
    }
  }
}
