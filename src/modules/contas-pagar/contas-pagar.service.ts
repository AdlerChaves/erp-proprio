import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { OrigemMovimentacao, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { ContaPagar, StatusContaPagar } from './conta-pagar.entity';
import { BaixaContaPagarDto } from './dto/baixa-conta-pagar.dto';
import { CreateContaPagarDto } from './dto/create-conta-pagar.dto';
import { FiltroContaPagarDto } from './dto/filtro-conta-pagar.dto';
import { UpdateContaPagarDto } from './dto/update-conta-pagar.dto';

const hoje = () => new Date().toISOString().slice(0, 10);

const RELACOES = { fornecedor: true, planoConta: true, centroCusto: true, contaBancaria: true } as const;

/** Campos de classificação, que podem mudar mesmo depois da baixa ou do cancelamento. */
const CAMPOS_CLASSIFICACAO = ['planoContaId', 'centroCustoId'];

@Injectable()
export class ContasPagarService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ContaPagar) private readonly repo: Repository<ContaPagar>,
    private readonly fornecedores: FornecedoresService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
    private readonly contasBancarias: ContasBancariasService,
    private readonly movimentacoes: MovimentacoesService,
  ) {}

  findAll(empresaId: string, filtro: FiltroContaPagarDto) {
    const where: FindOptionsWhere<ContaPagar> = {
      empresaId,
      fornecedorId: filtro.fornecedorId,
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
    if (!conta) throw new NotFoundException(`Conta a pagar ${id} não encontrada`);
    return conta;
  }

  async create(empresaId: string, dto: CreateContaPagarDto) {
    await this.fornecedores.findOne(empresaId, dto.fornecedorId);
    await this.validarClassificacao(empresaId, dto);
    const dataEmissao = dto.dataEmissao ?? hoje();
    this.validarDatas(dataEmissao, dto.dataVencimento);
    const { id } = await this.repo.save(this.repo.create({ ...dto, dataEmissao, empresaId }));
    return this.findOne(empresaId, id);
  }

  async update(empresaId: string, id: string, dto: UpdateContaPagarDto) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusContaPagar.ABERTA) {
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

  async baixar(empresaId: string, id: string, dto: BaixaContaPagarDto) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    const contaBancaria = await this.contasBancarias.findAtiva(empresaId, dto.contaBancariaId);
    conta.contaBancariaId = contaBancaria.id;
    conta.valorPago = dto.valorPago ?? conta.valor;
    conta.dataPagamento = dto.dataPagamento ?? hoje();
    conta.status = StatusContaPagar.PAGA;
    await this.dataSource.transaction(async (m) => {
      await m.save(conta);
      await this.movimentacoes.registrarBaixa(m, {
        empresaId,
        contaBancaria,
        tipo: TipoMovimentacao.SAIDA,
        valor: conta.valorPago!,
        data: conta.dataPagamento!,
        descricao: `Pagamento: ${conta.descricao}`,
        origem: OrigemMovimentacao.CONTA_PAGAR,
        contaPagarId: conta.id,
      });
    });
    return this.findOne(empresaId, id);
  }

  /** Desfaz a baixa: a conta volta a ABERTA e a movimentação bancária gerada por ela é removida. */
  async estornar(empresaId: string, id: string) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusContaPagar.PAGA) {
      throw new BadRequestException(`Conta ${id} está ${conta.status}; só contas pagas têm baixa a estornar`);
    }
    conta.status = StatusContaPagar.ABERTA;
    conta.valorPago = null;
    conta.dataPagamento = null;
    conta.contaBancariaId = null;
    await this.dataSource.transaction(async (m) => {
      await this.movimentacoes.removerDaBaixa(m, { contaPagarId: conta.id });
      await m.save(conta);
    });
    return this.findOne(empresaId, id);
  }

  async cancelar(empresaId: string, id: string) {
    const conta = await this.findAbertaOuFalha(empresaId, id);
    conta.status = StatusContaPagar.CANCELADA;
    await this.repo.save(conta);
    return this.findOne(empresaId, id);
  }

  /** Sem relações carregadas, para que salvar não sobrescreva as FKs alteradas. */
  private async findSemRelacoes(empresaId: string, id: string) {
    const conta = await this.repo.findOneBy({ id, empresaId });
    if (!conta) throw new NotFoundException(`Conta a pagar ${id} não encontrada`);
    return conta;
  }

  private async findAbertaOuFalha(empresaId: string, id: string) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusContaPagar.ABERTA) {
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
      await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, TipoPlanoConta.DESPESA);
    }
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
  }

  private validarDatas(emissao: string, vencimento: string) {
    if (vencimento < emissao) {
      throw new BadRequestException('dataVencimento não pode ser anterior à dataEmissao');
    }
  }
}
