import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContasPagarService } from '../contas-pagar/contas-pagar.service';
import { ContaReceber } from '../contas-receber/conta-receber.entity';
import { ContasReceberService } from '../contas-receber/contas-receber.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { StatusConta } from '../financeiro/status-conta.enum';
import { MovimentacaoBancaria, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { BaixarContaDto, ConciliarLinhaDto, LancarAvulsaDto } from './dto/acoes-linha.dto';
import { FiltroConciliacaoDto } from './dto/filtro-conciliacao.dto';
import { ImportarOfxDto } from './dto/importar-ofx.dto';
import { ImportacaoExtrato } from './importacao-extrato.entity';
import { LinhaExtrato } from './linha-extrato.entity';
import { decodificarOfx, lerOfx, OfxInvalido } from './ofx';

/** Diferença de dias que a conciliação automática aceita entre o banco e o sistema (compensação, fim de semana). */
const DIAS_AUTOMATICA = 3;
/** Janela das sugestões manuais. */
const DIAS_SUGESTAO = 7;
/** Janela de vencimento das contas em aberto sugeridas para baixa. */
const DIAS_CONTAS = 45;

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const distancia = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

type Status = 'PENDENTE' | 'CONCILIADA' | 'IGNORADA';
const statusDe = (l: LinhaExtrato): Status => (l.movimentacaoId ? 'CONCILIADA' : l.ignorada ? 'IGNORADA' : 'PENDENTE');

@Injectable()
export class ConciliacaoService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(LinhaExtrato) private readonly linhas: Repository<LinhaExtrato>,
    @InjectRepository(ImportacaoExtrato) private readonly importacoes: Repository<ImportacaoExtrato>,
    @InjectRepository(MovimentacaoBancaria) private readonly movimentacoes: Repository<MovimentacaoBancaria>,
    private readonly contasBancarias: ContasBancariasService,
    private readonly movimentacoesService: MovimentacoesService,
    private readonly contasReceber: ContasReceberService,
    private readonly contasPagar: ContasPagarService,
  ) {}

  /** Importa o OFX: grava só as transações ainda não importadas e já concilia as que têm par único. */
  async importar(empresaId: string, dto: ImportarOfxDto) {
    const conta = await this.contasBancarias.findOne(empresaId, dto.contaBancariaId);
    let extrato;
    try {
      extrato = lerOfx(decodificarOfx(Buffer.from(dto.conteudo, 'base64')));
    } catch (erro) {
      if (erro instanceof OfxInvalido) throw new BadRequestException(erro.message);
      throw erro;
    }
    if (extrato.transacoes.length === 0) throw new BadRequestException('O arquivo não tem transações');
    const antesDaAbertura = extrato.transacoes.filter((t) => t.data < conta.dataSaldoInicial).length;

    const resultado = await this.dataSource.transaction(async (m) => {
      const importacao = await m.save(
        m.create(ImportacaoExtrato, {
          empresaId,
          contaBancariaId: conta.id,
          nomeArquivo: dto.nomeArquivo.slice(0, 255),
          contaArquivo: extrato.conta?.slice(0, 40) ?? null,
          de: extrato.de,
          ate: extrato.ate,
          saldoBanco: extrato.saldo?.valor ?? null,
          dataSaldoBanco: extrato.saldo?.data ?? null,
          transacoes: extrato.transacoes.length,
          novas: 0,
        }),
      );
      // Transações anteriores ao saldo inicial da conta já estão nele: não entram.
      const validas = extrato.transacoes.filter((t) => t.data >= conta.dataSaldoInicial);
      const inseridas = validas.length
        ? await m
            .createQueryBuilder()
            .insert()
            .into(LinhaExtrato)
            .values(
              validas.map((t) => ({
                empresaId,
                contaBancariaId: conta.id,
                importacaoId: importacao.id,
                chave: t.chave,
                fitid: t.fitid?.slice(0, 255) ?? null,
                data: t.data,
                tipo: t.tipo === 'ENTRADA' ? TipoMovimentacao.ENTRADA : TipoMovimentacao.SAIDA,
                valor: t.valor,
                descricao: t.descricao,
                documento: t.documento?.slice(0, 60) ?? null,
              })),
            )
            .orIgnore()
            .returning('id')
            .execute()
        : { raw: [] };
      const novas = (inseridas.raw as unknown[]).length;
      await m.update(ImportacaoExtrato, importacao.id, { novas });
      return { importacao: { ...importacao, novas }, novas };
    });

    const conciliadas = await this.conciliarAutomaticamente(empresaId, conta.id);
    const digitosArquivo = extrato.conta?.replace(/\D/g, '') ?? '';
    const digitosConta = conta.numero?.replace(/\D/g, '') ?? '';
    const avisos = [
      digitosArquivo && digitosConta && !digitosArquivo.includes(digitosConta) && !digitosConta.includes(digitosArquivo)
        ? `O arquivo é da conta ${extrato.conta}, mas foi importado em ${conta.nome} (${conta.numero}). Confira.`
        : null,
      antesDaAbertura ? `${antesDaAbertura} transação(ões) anteriores ao saldo inicial da conta foram ignoradas.` : null,
    ].filter(Boolean);
    return {
      importacao: resultado.importacao,
      novas: resultado.novas,
      repetidas: extrato.transacoes.length - antesDaAbertura - resultado.novas,
      conciliadasAutomaticamente: conciliadas,
      avisos,
    };
  }

  /**
   * Liga cada linha pendente à única movimentação livre com o mesmo valor e sentido em até 3 dias.
   * Havendo mais de uma candidata, deixa para a escolha manual.
   */
  async conciliarAutomaticamente(empresaId: string, contaBancariaId: string) {
    await this.contasBancarias.findOne(empresaId, contaBancariaId);
    return this.dataSource.transaction(async (m) => {
      const pendentes = await m.find(LinhaExtrato, {
        where: { empresaId, contaBancariaId, movimentacaoId: IsNull(), ignorada: false },
        order: { data: 'ASC' },
      });
      if (pendentes.length === 0) return 0;
      const datas = pendentes.map((l) => l.data).sort();
      const livres = await this.movimentacoesLivres(empresaId, contaBancariaId, somarDias(datas[0], -DIAS_AUTOMATICA), somarDias(datas.at(-1)!, DIAS_AUTOMATICA));
      const usadas = new Set<string>();
      let conciliadas = 0;
      for (const linha of pendentes) {
        const candidatas = livres.filter(
          (mov) =>
            !usadas.has(mov.id) &&
            mov.tipo === linha.tipo &&
            centavos(mov.valor) === centavos(linha.valor) &&
            distancia(mov.data, linha.data) <= DIAS_AUTOMATICA,
        );
        if (candidatas.length !== 1) continue;
        // Duas linhas iguais disputando a mesma movimentação também ficam para a escolha manual.
        const disputada = pendentes.some(
          (outra) =>
            outra.id !== linha.id &&
            !outra.movimentacaoId &&
            outra.tipo === linha.tipo &&
            centavos(outra.valor) === centavos(linha.valor) &&
            distancia(outra.data, candidatas[0].data) <= DIAS_AUTOMATICA,
        );
        if (disputada) continue;
        usadas.add(candidatas[0].id);
        linha.movimentacaoId = candidatas[0].id;
        await m.update(LinhaExtrato, linha.id, { movimentacaoId: candidatas[0].id });
        conciliadas++;
      }
      return conciliadas;
    });
  }

  /** Linhas do banco no período, com sugestões para as pendentes, o que o sistema tem sem par e o confronto de saldos. */
  async painel(empresaId: string, filtro: FiltroConciliacaoDto) {
    const conta = await this.contasBancarias.findOne(empresaId, filtro.contaBancariaId);
    const ate = filtro.ate ?? hoje();
    const de = filtro.de ?? somarDias(ate, -30);
    if (ate < de) throw new BadRequestException('ate não pode ser anterior a de');

    const linhas = await this.linhas.find({
      where: { empresaId, contaBancariaId: conta.id, data: Between(de, ate) },
      relations: { movimentacao: true },
      order: { data: 'ASC', valor: 'ASC' },
    });
    const pendentes = linhas.filter((l) => statusDe(l) === 'PENDENTE');
    const livres = await this.movimentacoesLivres(empresaId, conta.id, somarDias(de, -DIAS_SUGESTAO), somarDias(ate, DIAS_SUGESTAO));
    const contasAbertas = pendentes.length ? await this.contasEmAberto(empresaId, de, ate) : { receber: [], pagar: [] };

    const comSugestoes = linhas.map((l) => {
      const status = statusDe(l);
      if (status !== 'PENDENTE') return { ...l, status, sugestoes: [], contasSugeridas: [] };
      const sugestoes = livres
        .filter((mov) => mov.tipo === l.tipo && centavos(mov.valor) === centavos(l.valor) && distancia(mov.data, l.data) <= DIAS_SUGESTAO)
        .sort((x, y) => distancia(x.data, l.data) - distancia(y.data, l.data))
        .slice(0, 5);
      const abertas = l.tipo === TipoMovimentacao.ENTRADA ? contasAbertas.receber : contasAbertas.pagar;
      const contasSugeridas = abertas
        .filter((c) => c.saldo === centavos(l.valor) && distancia(c.dataVencimento, l.data) <= DIAS_CONTAS)
        .sort((x, y) => distancia(x.dataVencimento, l.data) - distancia(y.dataVencimento, l.data))
        .slice(0, 5)
        .map((c) => ({ ...c, saldo: reais(c.saldo) }));
      return { ...l, status, sugestoes, contasSugeridas };
    });

    // Movimentações do período que nenhuma linha do banco explica (lançadas no sistema, mas não vistas no extrato).
    const semPar = livres.filter((mov) => mov.data >= de && mov.data <= ate);

    const ultima = await this.importacoes.findOne({
      where: { contaBancariaId: conta.id, dataSaldoBanco: Not(IsNull()) },
      order: { dataSaldoBanco: 'DESC', criadoEm: 'DESC' },
    });
    let saldos = null;
    if (ultima?.dataSaldoBanco && ultima.saldoBanco !== null) {
      const sistema = await this.movimentacoesService.saldos(empresaId, ultima.dataSaldoBanco);
      const saldoSistema = sistema.contas.find((c) => c.contaBancaria.id === conta.id)?.saldo ?? 0;
      saldos = {
        data: ultima.dataSaldoBanco,
        banco: ultima.saldoBanco,
        sistema: saldoSistema,
        diferenca: reais(centavos(ultima.saldoBanco) - centavos(saldoSistema)),
      };
    }

    const contar = (s: Status) => linhas.filter((l) => statusDe(l) === s).length;
    return {
      contaBancaria: { id: conta.id, nome: conta.nome },
      de,
      ate,
      linhas: comSugestoes,
      semPar,
      resumo: { pendentes: contar('PENDENTE'), conciliadas: contar('CONCILIADA'), ignoradas: contar('IGNORADA') },
      saldos,
      ultimaImportacao: ultima ?? (await this.importacoes.findOne({ where: { contaBancariaId: conta.id }, order: { criadoEm: 'DESC' } })),
    };
  }

  async conciliar(empresaId: string, id: string, dto: ConciliarLinhaDto) {
    const linha = await this.pendente(empresaId, id);
    const mov = await this.movimentacoes.findOneBy({ id: dto.movimentacaoId, empresaId });
    if (!mov) throw new NotFoundException(`Movimentação ${dto.movimentacaoId} não encontrada`);
    if (mov.contaBancariaId !== linha.contaBancariaId) throw new BadRequestException('A movimentação é de outra conta bancária');
    if (mov.tipo !== linha.tipo || centavos(mov.valor) !== centavos(linha.valor)) {
      throw new BadRequestException('A movimentação precisa ter o mesmo valor e o mesmo sentido (entrada ou saída) da linha do banco');
    }
    if (await this.linhas.existsBy({ movimentacaoId: mov.id })) {
      throw new ConflictException('Esta movimentação já está conciliada com outra linha do extrato');
    }
    await this.linhas.update(linha.id, { movimentacaoId: mov.id });
    return this.findOne(empresaId, id);
  }

  async desfazer(empresaId: string, id: string) {
    const linha = await this.findLinha(empresaId, id);
    await this.linhas.update(linha.id, { movimentacaoId: null, ignorada: false });
    return this.findOne(empresaId, id);
  }

  async ignorar(empresaId: string, id: string) {
    const linha = await this.pendente(empresaId, id);
    await this.linhas.update(linha.id, { ignorada: true });
    return this.findOne(empresaId, id);
  }

  /** Lança a linha como movimentação avulsa (tarifa, rendimento, ajuste) e concilia. */
  async lancarAvulsa(empresaId: string, id: string, dto: LancarAvulsaDto) {
    const linha = await this.pendente(empresaId, id);
    const mov = await this.movimentacoesService.criarAvulsa(empresaId, {
      contaBancariaId: linha.contaBancariaId,
      tipo: linha.tipo,
      valor: linha.valor,
      data: linha.data,
      descricao: dto.descricao?.trim() || linha.descricao,
      planoContaId: dto.planoContaId,
      centroCustoId: dto.centroCustoId,
    });
    await this.linhas.update(linha.id, { movimentacaoId: mov.id });
    return this.findOne(empresaId, id);
  }

  /** Dá baixa numa conta a receber (entrada) ou a pagar (saída) com o valor e a data da linha, e concilia. */
  async baixarConta(empresaId: string, id: string, dto: BaixarContaDto) {
    const linha = await this.pendente(empresaId, id);
    const entrada = linha.tipo === TipoMovimentacao.ENTRADA;
    const servico = entrada ? this.contasReceber : this.contasPagar;
    const conta = await servico.findOne(empresaId, dto.contaId);
    if (conta.status !== StatusConta.ABERTA && conta.status !== StatusConta.PARCIAL) {
      throw new BadRequestException(`A conta "${conta.descricao}" está ${conta.status} e não aceita pagamento`);
    }
    const recebido = centavos(linha.valor);
    const saldo = centavos(conta.saldo);
    const multa = centavos(dto.multa ?? 0);
    let principal = recebido;
    let juros = 0;
    let desconto = 0;
    if (recebido > saldo) {
      // O banco mostra mais que o saldo: a diferença é juros (e a multa informada).
      principal = saldo;
      if (multa > recebido - saldo) throw new BadRequestException('A multa é maior que a diferença entre o banco e o saldo da conta');
      juros = recebido - saldo - multa;
    } else if (dto.quitarComDesconto && recebido < saldo) {
      principal = saldo;
      desconto = saldo - recebido;
    }
    const atualizada = await servico.registrarBaixa(empresaId, conta.id, {
      contaBancariaId: linha.contaBancariaId,
      data: linha.data,
      valor: reais(principal),
      juros: reais(juros),
      multa: recebido > saldo ? reais(multa) : 0,
      desconto: reais(desconto),
    });
    const baixa = atualizada.baixas.at(-1)!;
    const mov = await this.movimentacoes.findOneByOrFail({ baixaId: baixa.id });
    await this.linhas.update(linha.id, { movimentacaoId: mov.id });
    return this.findOne(empresaId, id);
  }

  async findOne(empresaId: string, id: string) {
    const linha = await this.linhas.findOne({ where: { id, empresaId }, relations: { movimentacao: true } });
    if (!linha) throw new NotFoundException(`Linha do extrato ${id} não encontrada`);
    return { ...linha, status: statusDe(linha) };
  }

  /** Movimentações da conta no período que ainda não estão ligadas a nenhuma linha do extrato. */
  private movimentacoesLivres(empresaId: string, contaBancariaId: string, de: string, ate: string) {
    return this.movimentacoes
      .createQueryBuilder('m')
      .where('m.empresa_id = :empresaId AND m.conta_bancaria_id = :contaBancariaId', { empresaId, contaBancariaId })
      .andWhere('m.data BETWEEN :de AND :ate', { de, ate })
      .andWhere('NOT EXISTS (SELECT 1 FROM linhas_extrato l WHERE l.movimentacao_id = m.id)')
      .orderBy('m.data', 'ASC')
      .getMany();
  }

  /** Contas a receber e a pagar em aberto com vencimento perto do período, com o saldo em centavos. */
  private async contasEmAberto(empresaId: string, de: string, ate: string) {
    const janela = { empresaId, status: In([StatusConta.ABERTA, StatusConta.PARCIAL]), dataVencimento: Between(somarDias(de, -DIAS_CONTAS), somarDias(ate, DIAS_CONTAS)) };
    const comSaldo = async (repo: Repository<ContaReceber> | Repository<ContaPagar>, relacao: 'cliente' | 'fornecedor') => {
      const contas = (await repo.find({ where: janela, relations: { [relacao]: true, baixas: true } as never })) as (ContaReceber & ContaPagar)[];
      return contas.map((c) => ({
        id: c.id,
        descricao: c.descricao,
        dataVencimento: c.dataVencimento,
        pessoa: (c as unknown as Record<string, { nome: string }>)[relacao]?.nome ?? '',
        saldo: centavos(c.valor) - (c.baixas ?? []).reduce((s, b) => s + centavos(b.valor), 0),
      }));
    };
    const [receber, pagar] = await Promise.all([
      comSaldo(this.dataSource.getRepository(ContaReceber), 'cliente'),
      comSaldo(this.dataSource.getRepository(ContaPagar), 'fornecedor'),
    ]);
    return { receber, pagar };
  }

  private async findLinha(empresaId: string, id: string) {
    const linha = await this.linhas.findOneBy({ id, empresaId });
    if (!linha) throw new NotFoundException(`Linha do extrato ${id} não encontrada`);
    return linha;
  }

  private async pendente(empresaId: string, id: string) {
    const linha = await this.findLinha(empresaId, id);
    if (statusDe(linha) !== 'PENDENTE') {
      throw new BadRequestException(`A linha já está ${statusDe(linha) === 'CONCILIADA' ? 'conciliada' : 'ignorada'}; desfaça antes`);
    }
    return linha;
  }
}
