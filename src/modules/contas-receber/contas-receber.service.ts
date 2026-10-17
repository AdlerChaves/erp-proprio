import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ClientesService } from '../clientes/clientes.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { ContaReceber, StatusContaReceber } from './conta-receber.entity';
import { BaixaContaReceberDto } from './dto/baixa-conta-receber.dto';
import { CreateContaReceberDto } from './dto/create-conta-receber.dto';
import { FiltroContaReceberDto } from './dto/filtro-conta-receber.dto';
import { UpdateContaReceberDto } from './dto/update-conta-receber.dto';

const hoje = () => new Date().toISOString().slice(0, 10);

const RELACOES = { cliente: true, planoConta: true, centroCusto: true, contaBancaria: true } as const;

/** Campos de classificação, que podem mudar mesmo depois da baixa ou do cancelamento. */
const CAMPOS_CLASSIFICACAO = ['planoContaId', 'centroCustoId'];

@Injectable()
export class ContasReceberService {
  constructor(
    @InjectRepository(ContaReceber) private readonly repo: Repository<ContaReceber>,
    private readonly clientes: ClientesService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
    private readonly contasBancarias: ContasBancariasService,
  ) {}

  findAll(empresaId: string, filtro: FiltroContaReceberDto) {
    const where: FindOptionsWhere<ContaReceber> = {
      empresaId,
      clienteId: filtro.clienteId,
      planoContaId: filtro.planoContaId,
      centroCustoId: filtro.centroCustoId,
      status: filtro.status,
    };
    if (filtro.vencimentoDe && filtro.vencimentoAte) {
      where.dataVencimento = Between(filtro.vencimentoDe, filtro.vencimentoAte);
    } else if (filtro.vencimentoDe) {
      where.dataVencimento = MoreThanOrEqual(filtro.vencimentoDe);
    } else if (filtro.vencimentoAte) {
      where.dataVencimento = LessThanOrEqual(filtro.vencimentoAte);
    }
    return this.repo.find({ where, relations: RELACOES, order: { dataVencimento: 'ASC' } });
  }

  async findOne(empresaId: string, id: string) {
    const conta = await this.repo.findOne({ where: { id, empresaId }, relations: RELACOES });
    if (!conta) throw new NotFoundException(`Conta a receber ${id} não encontrada`);
    return conta;
  }

  async create(empresaId: string, dto: CreateContaReceberDto) {
    await this.clientes.findOne(empresaId, dto.clienteId);
    await this.validarClassificacao(empresaId, dto);
    const dataEmissao = dto.dataEmissao ?? hoje();
    this.validarDatas(dataEmissao, dto.dataVencimento);
    const { id } = await this.repo.save(this.repo.create({ ...dto, dataEmissao, empresaId }));
    return this.findOne(empresaId, id);
  }

  async update(empresaId: string, id: string, dto: UpdateContaReceberDto) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusContaReceber.ABERTA) {
      const naoPermitidos = Object.keys(dto).filter((campo) => !CAMPOS_CLASSIFICACAO.includes(campo));
      if (naoPermitidos.length) {
        throw new BadRequestException(
          `Conta ${conta.status}: só a categoria e o centro de custo podem mudar (recebido: ${naoPermitidos.join(', ')})`,
        );
      }
    }
    await this.validarClassificacao(empresaId, dto);
    this.validarDatas(dto.dataEmissao ?? conta.dataEmissao, dto.dataVencimento ?? conta.dataVencimento);
    await this.repo.save(this.repo.merge(conta, dto));
    return this.findOne(empresaId, id);
  }

  async baixar(empresaId: string, id: string, dto: BaixaContaReceberDto) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    const contaBancaria = await this.contasBancarias.findOne(empresaId, dto.contaBancariaId);
    if (!contaBancaria.ativo) {
      throw new BadRequestException(`A conta bancária ${contaBancaria.nome} está inativa`);
    }
    conta.contaBancariaId = contaBancaria.id;
    conta.valorPago = dto.valorPago ?? conta.valor;
    conta.dataPagamento = dto.dataPagamento ?? hoje();
    conta.status = StatusContaReceber.PAGA;
    await this.repo.save(conta);
    return this.findOne(empresaId, id);
  }

  async cancelar(empresaId: string, id: string) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    conta.status = StatusContaReceber.CANCELADA;
    await this.repo.save(conta);
    return this.findOne(empresaId, id);
  }

  /** Sem relações carregadas, para que salvar não sobrescreva as FKs alteradas. */
  private async findSemRelacoes(empresaId: string, id: string) {
    const conta = await this.repo.findOneBy({ id, empresaId });
    if (!conta) throw new NotFoundException(`Conta a receber ${id} não encontrada`);
    return conta;
  }

  private async findAbertaOuFalha(empresaId: string, id: string) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusContaReceber.ABERTA) {
      throw new BadRequestException(`Conta ${id} está ${conta.status} e não pode ser alterada`);
    }
    return conta;
  }

  /** Valida categoria e centro de custo informados; null significa remover e dispensa validação. */
  private async validarClassificacao(
    empresaId: string,
    dto: { planoContaId?: string | null; centroCustoId?: string | null },
  ) {
    if (dto.planoContaId) {
      const categoria = await this.planoContas.findOne(empresaId, dto.planoContaId);
      if (categoria.tipo !== TipoPlanoConta.RECEITA) {
        throw new BadRequestException(`A categoria ${categoria.codigo} não é de receita`);
      }
      if (!categoria.aceitaLancamento) {
        throw new BadRequestException(`A categoria ${categoria.codigo} é sintética; escolha uma subconta`);
      }
      if (!categoria.ativo) {
        throw new BadRequestException(`A categoria ${categoria.codigo} está inativa`);
      }
    }
    if (dto.centroCustoId) {
      const centro = await this.centrosCusto.findOne(empresaId, dto.centroCustoId);
      if (!centro.ativo) throw new BadRequestException(`O centro de custo ${centro.nome} está inativo`);
    }
  }

  private validarDatas(emissao: string, vencimento: string) {
    if (vencimento < emissao) {
      throw new BadRequestException('dataVencimento não pode ser anterior à dataEmissao');
    }
  }
}
