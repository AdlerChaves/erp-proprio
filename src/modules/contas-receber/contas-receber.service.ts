import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { ClientesService } from '../clientes/clientes.service';
import { ContaReceber, StatusContaReceber } from './conta-receber.entity';
import { BaixaContaReceberDto } from './dto/baixa-conta-receber.dto';
import { CreateContaReceberDto } from './dto/create-conta-receber.dto';
import { FiltroContaReceberDto } from './dto/filtro-conta-receber.dto';
import { UpdateContaReceberDto } from './dto/update-conta-receber.dto';

const hoje = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ContasReceberService {
  constructor(
    @InjectRepository(ContaReceber) private readonly repo: Repository<ContaReceber>,
    private readonly clientes: ClientesService,
  ) {}

  findAll(empresaId: string, filtro: FiltroContaReceberDto) {
    const where: FindOptionsWhere<ContaReceber> = { empresaId };
    if (filtro.clienteId) where.clienteId = filtro.clienteId;
    if (filtro.status) where.status = filtro.status;
    if (filtro.vencimentoDe && filtro.vencimentoAte) {
      where.dataVencimento = Between(filtro.vencimentoDe, filtro.vencimentoAte);
    } else if (filtro.vencimentoDe) {
      where.dataVencimento = MoreThanOrEqual(filtro.vencimentoDe);
    } else if (filtro.vencimentoAte) {
      where.dataVencimento = LessThanOrEqual(filtro.vencimentoAte);
    }
    return this.repo.find({ where, relations: { cliente: true }, order: { dataVencimento: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const conta = await this.repo.findOne({ where: { id, empresaId }, relations: { cliente: true } });
    if (!conta) throw new NotFoundException(`Conta a receber ${id} não encontrada`);
    return conta;
  }

  async create(empresaId: string, dto: CreateContaReceberDto) {
    await this.clientes.findOne(empresaId, dto.clienteId);
    const dataEmissao = dto.dataEmissao ?? hoje();
    this.validarDatas(dataEmissao, dto.dataVencimento);
    return this.repo.save(this.repo.create({ ...dto, dataEmissao, empresaId }));
  }

  async update(empresaId: string, id: string, dto: UpdateContaReceberDto) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    this.validarDatas(dto.dataEmissao ?? conta.dataEmissao, dto.dataVencimento ?? conta.dataVencimento);
    return this.repo.save(this.repo.merge(conta, dto));
  }

  async baixar(empresaId: string, id: string, dto: BaixaContaReceberDto) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    conta.valorPago = dto.valorPago ?? conta.valor;
    conta.dataPagamento = dto.dataPagamento ?? hoje();
    conta.status = StatusContaReceber.PAGA;
    return this.repo.save(conta);
  }

  async cancelar(empresaId: string, id: string) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    conta.status = StatusContaReceber.CANCELADA;
    return this.repo.save(conta);
  }

  private async findAbertaOuFalha(empresaId: string, id: string) {
    const conta = await this.findOne(empresaId, id);
    if (conta.status !== StatusContaReceber.ABERTA) {
      throw new BadRequestException(`Conta ${id} está ${conta.status} e não pode ser alterada`);
    }
    return conta;
  }

  private validarDatas(emissao: string, vencimento: string) {
    if (vencimento < emissao) {
      throw new BadRequestException('dataVencimento não pode ser anterior à dataEmissao');
    }
  }
}
