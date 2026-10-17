import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePlanoContaDto } from './dto/create-plano-conta.dto';
import { FiltroPlanoContaDto } from './dto/filtro-plano-conta.dto';
import { UpdatePlanoContaDto } from './dto/update-plano-conta.dto';
import { PlanoConta } from './plano-conta.entity';

@Injectable()
export class PlanoContasService {
  constructor(@InjectRepository(PlanoConta) private readonly repo: Repository<PlanoConta>) {}

  /** Lista plana em ordem de código; a árvore se monta pelo contaPaiId. */
  findAll(empresaId: string, filtro: FiltroPlanoContaDto) {
    return this.repo.find({ where: { empresaId, tipo: filtro.tipo }, order: { codigo: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const conta = await this.repo.findOneBy({ id, empresaId });
    if (!conta) throw new NotFoundException(`Conta ${id} do plano de contas não encontrada`);
    return conta;
  }

  async create(empresaId: string, dto: CreatePlanoContaDto) {
    await this.ensureCodigoLivre(empresaId, dto.codigo);
    if (dto.contaPaiId) {
      const pai = await this.findOne(empresaId, dto.contaPaiId);
      if (pai.aceitaLancamento) {
        throw new BadRequestException(`A conta pai ${pai.codigo} é analítica; torne-a sintética antes de criar subcontas`);
      }
      if (pai.tipo !== dto.tipo) {
        throw new BadRequestException(`A subconta precisa ser do mesmo tipo da conta pai (${pai.tipo})`);
      }
      this.validarPrefixo(dto.codigo, pai.codigo);
    }
    return this.repo.save(this.repo.create({ ...dto, empresaId }));
  }

  async update(empresaId: string, id: string, dto: UpdatePlanoContaDto) {
    const conta = await this.findOne(empresaId, id);
    const temSubcontas = await this.repo.existsBy({ empresaId, contaPaiId: id });

    if (dto.codigo && dto.codigo !== conta.codigo) {
      if (temSubcontas) throw new BadRequestException('Não é possível mudar o código de uma conta com subcontas');
      await this.ensureCodigoLivre(empresaId, dto.codigo);
      if (conta.contaPaiId) {
        const pai = await this.findOne(empresaId, conta.contaPaiId);
        this.validarPrefixo(dto.codigo, pai.codigo);
      }
    }
    if (dto.aceitaLancamento && temSubcontas) {
      throw new BadRequestException('Uma conta com subcontas precisa continuar sintética');
    }
    return this.repo.save(this.repo.merge(conta, dto));
  }

  async remove(empresaId: string, id: string) {
    const conta = await this.findOne(empresaId, id);
    if (await this.repo.existsBy({ empresaId, contaPaiId: id })) {
      throw new ConflictException('Remova ou mova as subcontas antes de remover esta conta');
    }
    await this.repo.remove(conta);
  }

  private validarPrefixo(codigo: string, codigoPai: string) {
    if (!codigo.startsWith(`${codigoPai}.`)) {
      throw new BadRequestException(`O código da subconta precisa começar com ${codigoPai}.`);
    }
  }

  private async ensureCodigoLivre(empresaId: string, codigo: string) {
    if (await this.repo.existsBy({ empresaId, codigo })) {
      throw new ConflictException(`Já existe conta com código ${codigo}`);
    }
  }
}
