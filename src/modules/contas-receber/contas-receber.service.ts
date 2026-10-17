import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ClientesService } from '../clientes/clientes.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { OrigemMovimentacao, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
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
    private readonly dataSource: DataSource,
    @InjectRepository(ContaReceber) private readonly repo: Repository<ContaReceber>,
    private readonly clientes: ClientesService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
    private readonly contasBancarias: ContasBancariasService,
    private readonly movimentacoes: MovimentacoesService,
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
    const contaBancaria = await this.contasBancarias.findAtiva(empresaId, dto.contaBancariaId);
    conta.contaBancariaId = contaBancaria.id;
    conta.valorPago = dto.valorPago ?? conta.valor;
    conta.dataPagamento = dto.dataPagamento ?? hoje();
    conta.status = StatusContaReceber.PAGA;
    await this.dataSource.transaction(async (m) => {
      await m.save(conta);
      await this.movimentacoes.registrarBaixa(m, {
        empresaId,
        contaBancaria,
        tipo: TipoMovimentacao.ENTRADA,
        valor: conta.valorPago!,
        data: conta.dataPagamento!,
        descricao: `Recebimento: ${conta.descricao}`,
        origem: OrigemMovimentacao.CONTA_RECEBER,
        contaReceberId: conta.id,
      });
    });
    return this.findOne(empresaId, id);
  }

  /** Desfaz a baixa: a conta volta a ABERTA e a movimentação bancária gerada por ela é removida. */
  async estornar(empresaId: string, id: string) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusContaReceber.PAGA) {
      throw new BadRequestException(`Conta ${id} está ${conta.status}; só contas pagas têm baixa a estornar`);
    }
    conta.status = StatusContaReceber.ABERTA;
    conta.valorPago = null;
    conta.dataPagamento = null;
    conta.contaBancariaId = null;
    await this.dataSource.transaction(async (m) => {
      await this.movimentacoes.removerDaBaixa(m, { contaReceberId: conta.id });
      await m.save(conta);
    });
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
      await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, TipoPlanoConta.RECEITA);
    }
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
  }

  private validarDatas(emissao: string, vencimento: string) {
    if (vencimento < emissao) {
      throw new BadRequestException('dataVencimento não pode ser anterior à dataEmissao');
    }
  }
}
