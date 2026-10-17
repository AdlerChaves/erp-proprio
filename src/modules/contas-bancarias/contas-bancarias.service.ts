import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { MovimentacaoBancaria } from '../movimentacoes/movimentacao-bancaria.entity';
import { ContaBancaria, TipoContaBancaria } from './conta-bancaria.entity';
import { CreateContaBancariaDto } from './dto/create-conta-bancaria.dto';
import { UpdateContaBancariaDto } from './dto/update-conta-bancaria.dto';

@Injectable()
export class ContasBancariasService {
  constructor(
    @InjectRepository(ContaBancaria) private readonly repo: Repository<ContaBancaria>,
    @InjectRepository(MovimentacaoBancaria) private readonly movimentacoes: Repository<MovimentacaoBancaria>,
  ) {}

  findAll(empresaId: string) {
    return this.repo.find({ where: { empresaId }, order: { nome: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const conta = await this.repo.findOneBy({ id, empresaId });
    if (!conta) throw new NotFoundException(`Conta bancária ${id} não encontrada`);
    return conta;
  }

  async findAtiva(empresaId: string, id: string) {
    const conta = await this.findOne(empresaId, id);
    if (!conta.ativo) throw new BadRequestException(`A conta bancária ${conta.nome} está inativa`);
    return conta;
  }

  async create(empresaId: string, dto: CreateContaBancariaDto) {
    await this.ensureNomeLivre(empresaId, dto.nome);
    const conta = this.repo.create({ ...dto, empresaId, dataSaldoInicial: dto.dataSaldoInicial ?? hoje() });
    this.validarDadosBancarios(conta);
    return this.repo.save(conta);
  }

  async update(empresaId: string, id: string, dto: UpdateContaBancariaDto) {
    const conta = await this.findOne(empresaId, id);
    if (dto.nome && dto.nome !== conta.nome) await this.ensureNomeLivre(empresaId, dto.nome);
    if (dto.dataSaldoInicial && dto.dataSaldoInicial > conta.dataSaldoInicial) {
      const anterior = await this.movimentacoes.existsBy({ contaBancariaId: id, data: LessThan(dto.dataSaldoInicial) });
      if (anterior) {
        throw new BadRequestException('Há movimentações anteriores à nova data do saldo inicial');
      }
    }
    this.repo.merge(conta, dto);
    this.validarDadosBancarios(conta);
    return this.repo.save(conta);
  }

  async remove(empresaId: string, id: string) {
    const conta = await this.findOne(empresaId, id);
    await this.repo.remove(conta);
  }

  private validarDadosBancarios(conta: ContaBancaria) {
    if (conta.tipo === TipoContaBancaria.CAIXA) {
      conta.banco = conta.agencia = conta.numero = null;
    } else if (!conta.banco || !conta.agencia || !conta.numero) {
      throw new BadRequestException('banco, agencia e numero são obrigatórios exceto para CAIXA');
    }
  }

  private async ensureNomeLivre(empresaId: string, nome: string) {
    if (await this.repo.existsBy({ empresaId, nome })) {
      throw new ConflictException(`Já existe conta bancária com nome ${nome}`);
    }
  }
}
