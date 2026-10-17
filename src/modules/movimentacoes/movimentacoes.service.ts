import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Between, DataSource, EntityManager, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContaBancaria } from '../contas-bancarias/conta-bancaria.entity';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { CreateMovimentacaoDto } from './dto/create-movimentacao.dto';
import { ExtratoDto } from './dto/extrato.dto';
import { FiltroMovimentacaoDto } from './dto/filtro-movimentacao.dto';
import { TransferenciaDto } from './dto/transferencia.dto';
import { MovimentacaoBancaria, OrigemMovimentacao, TipoMovimentacao } from './movimentacao-bancaria.entity';

/** Dados de uma movimentação gerada pela baixa de uma conta. */
export interface MovimentacaoDaBaixa {
  empresaId: string;
  contaBancaria: ContaBancaria;
  tipo: TipoMovimentacao;
  valor: number;
  data: string;
  descricao: string;
  origem: OrigemMovimentacao.CONTA_RECEBER | OrigemMovimentacao.CONTA_PAGAR;
  baixaId: string;
}

const sinal = (m: Pick<MovimentacaoBancaria, 'tipo' | 'valor'>) =>
  m.tipo === TipoMovimentacao.ENTRADA ? centavos(m.valor) : -centavos(m.valor);

@Injectable()
export class MovimentacoesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MovimentacaoBancaria) private readonly repo: Repository<MovimentacaoBancaria>,
    private readonly contasBancarias: ContasBancariasService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
  ) {}

  /** Chamado ao registrar uma baixa de conta a receber ou a pagar, dentro da transação dela. */
  async registrarBaixa(m: EntityManager, dados: MovimentacaoDaBaixa) {
    this.validarData(dados.contaBancaria, dados.data);
    const { contaBancaria, ...resto } = dados;
    return m.save(
      m.create(MovimentacaoBancaria, {
        ...resto,
        contaBancariaId: contaBancaria.id,
        descricao: dados.descricao.slice(0, 255),
      }),
    );
  }

  /** Chamado pelo estorno da baixa, dentro da transação dele. */
  async removerDaBaixa(m: EntityManager, baixaId: string) {
    await m.delete(MovimentacaoBancaria, { baixaId });
  }

  findAll(empresaId: string, filtro: FiltroMovimentacaoDto) {
    const where: FindOptionsWhere<MovimentacaoBancaria> = {
      empresaId,
      contaBancariaId: filtro.contaBancariaId,
      tipo: filtro.tipo,
      origem: filtro.origem,
    };
    if (filtro.de && filtro.ate) where.data = Between(filtro.de, filtro.ate);
    else if (filtro.de) where.data = MoreThanOrEqual(filtro.de);
    else if (filtro.ate) where.data = LessThanOrEqual(filtro.ate);
    return this.repo.find({
      where,
      relations: { contaBancaria: true, planoConta: true, centroCusto: true },
      order: { data: 'ASC', criadoEm: 'ASC', id: 'ASC' },
    });
  }

  async criarAvulsa(empresaId: string, dto: CreateMovimentacaoDto) {
    const contaBancaria = await this.contasBancarias.findAtiva(empresaId, dto.contaBancariaId);
    if (dto.planoContaId) {
      const tipoCategoria = dto.tipo === TipoMovimentacao.ENTRADA ? TipoPlanoConta.RECEITA : TipoPlanoConta.DESPESA;
      await this.planoContas.findParaLancamento(empresaId, dto.planoContaId, tipoCategoria);
    }
    if (dto.centroCustoId) await this.centrosCusto.findAtivo(empresaId, dto.centroCustoId);
    const data = dto.data ?? hoje();
    this.validarData(contaBancaria, data);
    return this.repo.save(
      this.repo.create({ ...dto, empresaId, data, origem: OrigemMovimentacao.AVULSA }),
    );
  }

  /** Gera a saída na origem e a entrada no destino, ligadas pelo mesmo transferenciaId. */
  async transferir(empresaId: string, dto: TransferenciaDto) {
    if (dto.contaOrigemId === dto.contaDestinoId) {
      throw new BadRequestException('A conta de origem e a de destino precisam ser diferentes');
    }
    const origem = await this.contasBancarias.findAtiva(empresaId, dto.contaOrigemId);
    const destino = await this.contasBancarias.findAtiva(empresaId, dto.contaDestinoId);
    const data = dto.data ?? hoje();
    this.validarData(origem, data);
    this.validarData(destino, data);

    const comum = {
      empresaId,
      data,
      valor: dto.valor,
      descricao: dto.descricao ?? 'Transferência entre contas',
      origem: OrigemMovimentacao.TRANSFERENCIA,
      transferenciaId: randomUUID(),
    };
    return this.dataSource.transaction(async (m) => [
      await m.save(m.create(MovimentacaoBancaria, { ...comum, contaBancariaId: origem.id, tipo: TipoMovimentacao.SAIDA })),
      await m.save(m.create(MovimentacaoBancaria, { ...comum, contaBancariaId: destino.id, tipo: TipoMovimentacao.ENTRADA })),
    ]);
  }

  /** Remove uma avulsa ou as duas pernas de uma transferência. As de baixa saem pelo estorno da conta. */
  async remover(empresaId: string, id: string) {
    const movimentacao = await this.repo.findOneBy({ id, empresaId });
    if (!movimentacao) throw new NotFoundException(`Movimentação ${id} não encontrada`);

    switch (movimentacao.origem) {
      case OrigemMovimentacao.CONTA_RECEBER:
      case OrigemMovimentacao.CONTA_PAGAR:
        throw new BadRequestException('Esta movimentação veio de uma baixa; estorne a baixa da conta');
      case OrigemMovimentacao.TRANSFERENCIA:
        await this.repo.delete({ empresaId, transferenciaId: movimentacao.transferenciaId! });
        return;
      default:
        await this.repo.delete({ id, empresaId });
    }
  }

  /** Saldo de cada conta da empresa ao fim do dia informado. */
  async saldos(empresaId: string, data = hoje()) {
    const contas = await this.contasBancarias.findAll(empresaId);
    const somas: { contaBancariaId: string; total: string }[] = await this.repo.query(
      `SELECT conta_bancaria_id AS "contaBancariaId",
              SUM(CASE WHEN tipo = 'ENTRADA' THEN valor ELSE -valor END) AS total
         FROM movimentacoes_bancarias
        WHERE empresa_id = $1 AND data <= $2
        GROUP BY conta_bancaria_id`,
      [empresaId, data],
    );
    const movimentado = new Map(somas.map((s) => [s.contaBancariaId, centavos(s.total)]));

    let total = 0;
    const saldos = contas.map((conta) => {
      const saldo = conta.dataSaldoInicial <= data ? centavos(conta.saldoInicial) + (movimentado.get(conta.id) ?? 0) : 0;
      total += saldo;
      return {
        contaBancaria: { id: conta.id, nome: conta.nome, tipo: conta.tipo, ativo: conta.ativo },
        saldoInicial: conta.saldoInicial,
        dataSaldoInicial: conta.dataSaldoInicial,
        saldo: reais(saldo),
      };
    });
    return { data, contas: saldos, total: reais(total) };
  }

  /** Movimentações do período com o saldo após cada uma. */
  async extrato(empresaId: string, filtro: ExtratoDto) {
    const conta = await this.contasBancarias.findOne(empresaId, filtro.contaBancariaId);
    const de = filtro.de ?? conta.dataSaldoInicial;
    const ate = filtro.ate ?? hoje();
    if (ate < de) throw new BadRequestException('ate não pode ser anterior a de');

    const [{ total }]: { total: string | null }[] = await this.repo.query(
      `SELECT SUM(CASE WHEN tipo = 'ENTRADA' THEN valor ELSE -valor END) AS total
         FROM movimentacoes_bancarias
        WHERE conta_bancaria_id = $1 AND data < $2`,
      [conta.id, de],
    );
    const saldoAnterior = centavos(conta.saldoInicial) + centavos(total ?? 0);

    const movimentacoes = await this.findAll(empresaId, { contaBancariaId: conta.id, de, ate });
    let saldo = saldoAnterior;
    const linhas = movimentacoes.map(({ contaBancaria: _, ...mov }) => {
      saldo += sinal(mov);
      return { ...mov, saldo: reais(saldo) };
    });

    return {
      contaBancaria: { id: conta.id, nome: conta.nome },
      de,
      ate,
      saldoAnterior: reais(saldoAnterior),
      movimentacoes: linhas,
      saldoFinal: reais(saldo),
    };
  }

  private validarData(conta: ContaBancaria, data: string) {
    if (data < conta.dataSaldoInicial) {
      throw new BadRequestException(
        `A data ${data} é anterior ao saldo inicial da conta ${conta.nome} (${conta.dataSaldoInicial})`,
      );
    }
  }
}
