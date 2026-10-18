import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Between,
  DataSource,
  DeepPartial,
  EntityManager,
  FindOptionsRelations,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { OrigemMovimentacao, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { Baixa } from './baixa.entity';
import { BaixaDto } from './dto/baixa.dto';
import { DadosContaDto, UpdateContaDto } from './dto/dados-conta.dto';
import { FiltroContasDto } from './dto/filtro-contas.dto';
import { StatusConta } from './status-conta.enum';

/** Colunas comuns às entidades ContaReceber e ContaPagar. */
export interface ContaFinanceira {
  id: string;
  empresaId: string;
  descricao: string;
  valor: number;
  dataEmissao: string;
  dataVencimento: string;
  status: StatusConta;
  planoContaId: string | null;
  centroCustoId: string | null;
  parcelamentoId: string | null;
  parcela: number | null;
  totalParcelas: number | null;
  baixas?: Baixa[];
}

/** Venda ou compra que gerou a conta. */
export type OrigemConta = { vendaId: string } | { compraId: string };

/** Conta ou parcelas geradas por uma venda ou compra. */
export interface LancamentoDeOrigem {
  pessoaId: string;
  descricao: string;
  valor: number;
  dataEmissao: string;
  primeiroVencimento: string;
  parcelas: number;
  planoContaId: string | null;
  centroCustoId: string | null;
  origem: OrigemConta;
}

/** O que diferencia contas a receber de contas a pagar. */
export interface ConfigContas {
  /** Para mensagens: "Conta a receber". */
  nome: string;
  campoPessoa: 'clienteId' | 'fornecedorId';
  relacaoPessoa: 'cliente' | 'fornecedor';
  chaveBaixa: 'contaReceberId' | 'contaPagarId';
  tipoCategoria: TipoPlanoConta;
  tipoMovimentacao: TipoMovimentacao;
  origem: OrigemMovimentacao.CONTA_RECEBER | OrigemMovimentacao.CONTA_PAGAR;
  /** Prefixo da descrição da movimentação bancária: "Recebimento". */
  verboBaixa: string;
}

/** Campos de classificação, que podem mudar mesmo depois de baixas ou do cancelamento. */
const CAMPOS_CLASSIFICACAO = ['planoContaId', 'centroCustoId'];

const MAXIMO_PARCELAS = 120;

const ORDEM_BAIXAS = { data: 'ASC', seq: 'ASC' } as const;

/** Soma meses mantendo o dia, ou o último dia do mês quando ele não existe (31/01 + 1 mês = 28 ou 29/02). */
export function somarMeses(data: string, meses: number) {
  const [ano, mes, dia] = data.split('-').map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

/** Divide em centavos; os centavos que sobram vão para as primeiras parcelas. */
export function dividirEmParcelas(valor: number, parcelas: number) {
  const total = centavos(valor);
  const base = Math.floor(total / parcelas);
  const resto = total - base * parcelas;
  return Array.from({ length: parcelas }, (_, i) => reais(base + (i < resto ? 1 : 0)));
}

/**
 * Lógica de contas a receber e a pagar. Cada módulo estende esta classe com sua entidade,
 * a validação do cliente ou fornecedor e a configuração.
 */
export abstract class ContasFinanceirasService<T extends ContaFinanceira> {
  constructor(
    protected readonly config: ConfigContas,
    protected readonly dataSource: DataSource,
    protected readonly repo: Repository<T>,
    protected readonly planoContas: PlanoContasService,
    protected readonly centrosCusto: CentrosCustoService,
    protected readonly contasBancarias: ContasBancariasService,
    protected readonly movimentacoes: MovimentacoesService,
  ) {}

  /** Garante que o cliente ou fornecedor existe na empresa. */
  protected abstract validarPessoa(empresaId: string, id: string): Promise<unknown>;

  private get relacoes() {
    return {
      [this.config.relacaoPessoa]: true,
      planoConta: true,
      centroCusto: true,
      baixas: { contaBancaria: true },
    } as unknown as FindOptionsRelations<T>;
  }

  async findAll(empresaId: string, filtro: FiltroContasDto & Partial<Record<ConfigContas['campoPessoa'], string>>) {
    const where: Record<string, unknown> = {
      empresaId,
      [this.config.campoPessoa]: filtro[this.config.campoPessoa],
      planoContaId: filtro.planoContaId,
      centroCustoId: filtro.centroCustoId,
      parcelamentoId: filtro.parcelamentoId,
      status: filtro.status,
    };
    if (filtro.vencimentoDe && filtro.vencimentoAte) {
      where.dataVencimento = Between(filtro.vencimentoDe, filtro.vencimentoAte);
    } else if (filtro.vencimentoDe) {
      where.dataVencimento = MoreThanOrEqual(filtro.vencimentoDe);
    } else if (filtro.vencimentoAte) {
      where.dataVencimento = LessThanOrEqual(filtro.vencimentoAte);
    }
    const contas = await this.repo.find({
      where: where as FindOptionsWhere<T>,
      relations: this.relacoes,
      order: { dataVencimento: 'ASC', parcela: 'ASC', baixas: ORDEM_BAIXAS } as never,
    });
    return contas.map((conta) => this.apresentar(conta));
  }

  async findOne(empresaId: string, id: string) {
    const conta = await this.repo.findOne({
      where: { id, empresaId } as FindOptionsWhere<T>,
      relations: this.relacoes,
      order: { baixas: ORDEM_BAIXAS } as never,
    });
    if (!conta) throw new NotFoundException(`${this.config.nome} ${id} não encontrada`);
    return this.apresentar(conta);
  }

  async create(empresaId: string, dto: DadosContaDto & Partial<Record<ConfigContas['campoPessoa'], string>>) {
    await this.validarNova(empresaId, dto);
    const dataEmissao = dto.dataEmissao ?? hoje();
    this.validarDatas(dataEmissao, dto.dataVencimento);
    const { id } = await this.repo.save(this.repo.create({ ...dto, dataEmissao, empresaId } as DeepPartial<T>));
    return this.findOne(empresaId, id);
  }

  /**
   * Lança o valor total em parcelas mensais a partir de dataVencimento.
   * Todas recebem o mesmo parcelamentoId e a descrição "Descrição (1/3)".
   */
  async criarParcelamento(
    empresaId: string,
    dto: DadosContaDto & { parcelas: number } & Partial<Record<ConfigContas['campoPessoa'], string>>,
  ) {
    if (dto.parcelas < 2 || dto.parcelas > MAXIMO_PARCELAS) {
      throw new BadRequestException(`parcelas deve estar entre 2 e ${MAXIMO_PARCELAS}`);
    }
    if (centavos(dto.valor) < dto.parcelas) {
      throw new BadRequestException('O valor não cobre um centavo por parcela');
    }
    await this.validarNova(empresaId, dto);
    const dataEmissao = dto.dataEmissao ?? hoje();
    this.validarDatas(dataEmissao, dto.dataVencimento);

    const { parcelas, ...dados } = dto;
    let parcelamentoId = '';
    await this.dataSource.transaction(async (m) => {
      parcelamentoId = await this.gravarParcelas(m, { ...dados, empresaId, dataEmissao }, parcelas);
    });
    return this.findAll(empresaId, { parcelamentoId });
  }

  /**
   * Lança, dentro da transação de quem chama, a conta (ou as parcelas mensais) de uma venda ou compra.
   * A categoria e o centro de custo são validados de novo: podem ter sido desativados desde o pedido.
   */
  async lancarDaOrigem(m: EntityManager, empresaId: string, l: LancamentoDeOrigem) {
    await this.validarClassificacao(empresaId, l);
    this.validarDatas(l.dataEmissao, l.primeiroVencimento);
    if (centavos(l.valor) < l.parcelas) throw new BadRequestException('O valor não cobre um centavo por parcela');
    await this.gravarParcelas(
      m,
      {
        empresaId,
        [this.config.campoPessoa]: l.pessoaId,
        descricao: l.descricao,
        valor: l.valor,
        dataEmissao: l.dataEmissao,
        dataVencimento: l.primeiroVencimento,
        planoContaId: l.planoContaId,
        centroCustoId: l.centroCustoId,
        ...l.origem,
      },
      l.parcelas,
    );
  }

  /** Cancela, na transação de quem chama, as contas de uma venda ou compra; recusa se alguma já tem baixa. */
  async cancelarDaOrigem(m: EntityManager, empresaId: string, origem: OrigemConta) {
    const contas = await m.getRepository(this.repo.target).find({
      where: { empresaId, ...origem } as unknown as FindOptionsWhere<T>,
      lock: { mode: 'pessimistic_write' },
    });
    const pagas = contas.filter((c) => c.status === StatusConta.PARCIAL || c.status === StatusConta.PAGA);
    if (pagas.length) {
      throw new BadRequestException(
        `${pagas.map((c) => `"${c.descricao}"`).join(', ')} já ${pagas.length === 1 ? 'tem' : 'têm'} pagamento registrado; estorne antes de cancelar`,
      );
    }
    for (const conta of contas.filter((c) => c.status === StatusConta.ABERTA)) {
      await this.atualizarStatus(m, conta.id, StatusConta.CANCELADA);
    }
  }

  async findDaOrigem(empresaId: string, origem: OrigemConta) {
    const contas = await this.repo.find({
      where: { empresaId, ...origem } as unknown as FindOptionsWhere<T>,
      relations: this.relacoes,
      order: { dataVencimento: 'ASC', parcela: 'ASC', baixas: ORDEM_BAIXAS } as never,
    });
    return contas.map((conta) => this.apresentar(conta));
  }

  /**
   * Grava uma conta, ou as parcelas mensais a partir de dataVencimento, com o mesmo parcelamentoId
   * e a descrição "Descrição (1/3)". Devolve o parcelamentoId (vazio se for uma conta só).
   */
  private async gravarParcelas(
    m: EntityManager,
    dados: Record<string, unknown> & { descricao: string; valor: number; dataVencimento: string },
    parcelas: number,
  ) {
    if (parcelas === 1) {
      await m.save(m.create(this.repo.target, dados as DeepPartial<T>));
      return '';
    }
    const parcelamentoId = randomUUID();
    for (const [i, valor] of dividirEmParcelas(dados.valor, parcelas).entries()) {
      await m.save(
        m.create(this.repo.target, {
          ...dados,
          valor,
          dataVencimento: somarMeses(dados.dataVencimento, i),
          descricao: `${dados.descricao} (${i + 1}/${parcelas})`.slice(0, 255),
          parcelamentoId,
          parcela: i + 1,
          totalParcelas: parcelas,
        } as DeepPartial<T>),
      );
    }
    return parcelamentoId;
  }

  async update(empresaId: string, id: string, dto: UpdateContaDto) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status !== StatusConta.ABERTA) {
      const naoPermitidos = Object.keys(dto).filter((campo) => !CAMPOS_CLASSIFICACAO.includes(campo));
      if (naoPermitidos.length) {
        throw new BadRequestException(
          `Conta ${conta.status}: só a categoria e o centro de custo podem mudar (recebido: ${naoPermitidos.join(', ')})`,
        );
      }
    }
    await this.validarClassificacao(empresaId, dto);
    this.validarDatas(dto.dataEmissao ?? conta.dataEmissao, dto.dataVencimento ?? conta.dataVencimento);
    await this.repo.save(this.repo.merge(conta, dto as DeepPartial<T>));
    return this.findOne(empresaId, id);
  }

  /**
   * Registra um pagamento total ou parcial e a movimentação bancária correspondente.
   * A conta fica PARCIAL enquanto houver saldo e PAGA quando ele zera.
   */
  async registrarBaixa(empresaId: string, id: string, dto: BaixaDto) {
    const contaBancaria = await this.contasBancarias.findAtiva(empresaId, dto.contaBancariaId);

    await this.dataSource.transaction(async (m) => {
      const conta = await this.travar(m, empresaId, id);
      if (conta.status !== StatusConta.ABERTA && conta.status !== StatusConta.PARCIAL) {
        throw new BadRequestException(`Conta ${id} está ${conta.status} e não aceita baixas`);
      }

      const saldo = centavos(conta.valor) - (await this.principalBaixado(m, id));
      const principal = dto.valor === undefined ? saldo : centavos(dto.valor);
      if (principal > saldo) {
        throw new BadRequestException(`O valor ${reais(principal)} excede o saldo em aberto de ${reais(saldo)}`);
      }
      const [juros, multa, desconto] = [dto.juros ?? 0, dto.multa ?? 0, dto.desconto ?? 0].map(centavos);
      const total = principal + juros + multa - desconto;
      if (total <= 0) throw new BadRequestException('O desconto não pode zerar o valor da baixa');

      const data = dto.data ?? hoje();
      const baixa = await m.save(
        m.create(Baixa, {
          empresaId,
          [this.config.chaveBaixa]: id,
          contaBancariaId: contaBancaria.id,
          data,
          valor: reais(principal),
          juros: reais(juros),
          multa: reais(multa),
          desconto: reais(desconto),
          valorTotal: reais(total),
        }),
      );
      await this.movimentacoes.registrarBaixa(m, {
        empresaId,
        contaBancaria,
        tipo: this.config.tipoMovimentacao,
        valor: reais(total),
        data,
        descricao: `${this.config.verboBaixa}: ${conta.descricao}`,
        origem: this.config.origem,
        baixaId: baixa.id,
      });
      await this.atualizarStatus(m, id, principal === saldo ? StatusConta.PAGA : StatusConta.PARCIAL);
    });
    return this.findOne(empresaId, id);
  }

  /** Desfaz uma baixa e sua movimentação; a conta volta a PARCIAL ou ABERTA. */
  async estornarBaixa(empresaId: string, id: string, baixaId: string) {
    await this.dataSource.transaction(async (m) => {
      await this.travar(m, empresaId, id);
      const baixa = await m.findOneBy(Baixa, { id: baixaId, empresaId, [this.config.chaveBaixa]: id });
      if (!baixa) throw new NotFoundException(`Baixa ${baixaId} não encontrada nesta conta`);

      await this.movimentacoes.removerDaBaixa(m, baixa.id);
      await m.delete(Baixa, { id: baixa.id });
      const restante = await this.principalBaixado(m, id);
      await this.atualizarStatus(m, id, restante > 0 ? StatusConta.PARCIAL : StatusConta.ABERTA);
    });
    return this.findOne(empresaId, id);
  }

  async cancelar(empresaId: string, id: string) {
    const conta = await this.findSemRelacoes(empresaId, id);
    if (conta.status === StatusConta.PARCIAL || conta.status === StatusConta.PAGA) {
      throw new BadRequestException(`Conta ${id} tem baixas; estorne-as antes de cancelar`);
    }
    if (conta.status === StatusConta.CANCELADA) {
      throw new BadRequestException(`Conta ${id} já está cancelada`);
    }
    await this.dataSource.transaction((m) => this.atualizarStatus(m, id, StatusConta.CANCELADA));
    return this.findOne(empresaId, id);
  }

  /** Acrescenta o total baixado e o saldo em aberto. As baixas já vêm ordenadas por data e gravação. */
  private apresentar(conta: T) {
    const baixas = (conta.baixas ?? []).map(({ seq: _, ...baixa }) => baixa);
    const baixado = baixas.reduce((soma, b) => soma + centavos(b.valor), 0);
    return { ...conta, baixas, valorBaixado: reais(baixado), saldo: reais(centavos(conta.valor) - baixado) };
  }

  /** Sem relações carregadas, para que salvar não sobrescreva as FKs alteradas. */
  private async findSemRelacoes(empresaId: string, id: string) {
    const conta = await this.repo.findOneBy({ id, empresaId } as FindOptionsWhere<T>);
    if (!conta) throw new NotFoundException(`${this.config.nome} ${id} não encontrada`);
    return conta;
  }

  /** Lê a conta com trava de escrita, para duas baixas simultâneas não ultrapassarem o saldo. */
  private async travar(m: EntityManager, empresaId: string, id: string) {
    const conta = await m.getRepository(this.repo.target).findOne({
      where: { id, empresaId } as FindOptionsWhere<T>,
      lock: { mode: 'pessimistic_write' },
    });
    if (!conta) throw new NotFoundException(`${this.config.nome} ${id} não encontrada`);
    return conta;
  }

  /** Principal já baixado, em centavos. */
  private async principalBaixado(m: EntityManager, id: string) {
    const baixas = await m.find(Baixa, { where: { [this.config.chaveBaixa]: id } });
    return baixas.reduce((soma, b) => soma + centavos(b.valor), 0);
  }

  private async atualizarStatus(m: EntityManager, id: string, status: StatusConta) {
    await m.getRepository(this.repo.target).update(id, { status } as never);
  }

  private async validarNova(
    empresaId: string,
    dto: DadosContaDto & Partial<Record<ConfigContas['campoPessoa'], string>>,
  ) {
    await this.validarPessoa(empresaId, dto[this.config.campoPessoa]!);
    await this.validarClassificacao(empresaId, dto);
  }

  /** Valida categoria e centro de custo informados; null significa remover e dispensa validação. */
  private async validarClassificacao(
    empresaId: string,
    dto: { planoContaId?: string | null; centroCustoId?: string | null },
  ) {
    if (dto.planoContaId) {
      await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, this.config.tipoCategoria);
    }
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
  }

  private validarDatas(emissao: string, vencimento: string) {
    if (vencimento < emissao) {
      throw new BadRequestException('dataVencimento não pode ser anterior à dataEmissao');
    }
  }
}
