import { EntityManager } from 'typeorm';
import { centavos, reais } from '../../common/dinheiro';
import { ajustarDiaUtil } from '../../common/dias-uteis';
import { DespesaRecorrente, TipoValorDespesa } from './despesa-recorrente.entity';

/**
 * Regras de uma despesa recorrente que valem para o lançamento das contas e para a projeção do caixa:
 * em que meses ela vence, em que dia (útil) e quanto se espera pagar.
 */

const meses = (competencia: string) => Number(competencia.slice(0, 4)) * 12 + Number(competencia.slice(5, 7)) - 1;
const competenciaDe = (total: number) => `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
export const somarMesesCompetencia = (competencia: string, n: number) => competenciaDe(meses(competencia) + n);

export type Recorrencia = Pick<DespesaRecorrente, 'inicio' | 'fim' | 'intervaloMeses' | 'diaVencimento' | 'ajusteDiaUtil' | 'diasAntecedencia'>;

/** Se a despesa vence nessa competência (respeitando início, fim e a periodicidade). */
export function venceEm(d: Recorrencia, competencia: string) {
  if (competencia < d.inicio || (d.fim && competencia > d.fim)) return false;
  return (meses(competencia) - meses(d.inicio)) % d.intervaloMeses === 0;
}

/** Vencimento na competência: o dia combinado (ou o último dia do mês), levado ao dia útil conforme o ajuste. */
export function vencimentoEm(d: Recorrencia, competencia: string) {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return ajustarDiaUtil(`${competencia}-${String(Math.min(d.diaVencimento, ultimo)).padStart(2, '0')}`, d.ajusteDiaUtil);
}

/** Dia em que a conta a pagar é lançada: a antecedência antes do vencimento. */
export function lancamentoEm(vencimento: string, diasAntecedencia: number) {
  const data = new Date(`${vencimento}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() - diasAntecedencia);
  return data.toISOString().slice(0, 10);
}

/** As competências em que vence, de "de" até a primeira cujo vencimento passa de "ate". */
export function ocorrencias(d: Recorrencia, de: string, ate: string) {
  const lista: { competencia: string; vencimento: string }[] = [];
  for (let c = de < d.inicio ? d.inicio : de; ; c = somarMesesCompetencia(c, 1)) {
    if (d.fim && c > d.fim) break;
    if (!venceEm(d, c)) continue;
    const vencimento = vencimentoEm(d, c);
    if (vencimento > ate) break;
    lista.push({ competencia: c, vencimento });
  }
  return lista;
}

/** Faturamento (vendas faturadas) de cada mês, em centavos. */
async function faturamentoPorMes(m: EntityManager, empresaId: string, de: string, ate: string) {
  const linhas: { mes: string; total: string }[] = await m.query(
    `SELECT to_char(data_faturamento, 'YYYY-MM') AS mes, SUM(total) AS total
       FROM vendas
      WHERE empresa_id = $1 AND status = 'FATURADA' AND data_faturamento >= $2 AND data_faturamento < $3
      GROUP BY 1`,
    [empresaId, `${de}-01`, `${somarMesesCompetencia(ate, 1)}-01`],
  );
  return new Map(linhas.map((l) => [l.mes, centavos(l.total)]));
}

export interface ValorPrevisto {
  valor: number;
  /** false só para despesa de valor fixo; nas outras, o valor real só se sabe quando a conta chega. */
  estimado: boolean;
  /** Como o valor foi calculado, para mostrar ao usuário. */
  base: string;
}

/**
 * Calcula quanto se espera pagar em cada competência. Usa o que já se sabe da empresa: as contas reais anteriores
 * (despesas variáveis) e o faturamento (despesas sobre o faturamento). `mesAtual` separa meses fechados dos futuros.
 */
export class PrevisaoDespesas {
  private faturamento = new Map<string, number>();
  private mediaFaturamento = 0;
  private mediasReais = new Map<string, number | null>();

  private constructor(private readonly mesAtual: string) {}

  static async carregar(m: EntityManager, empresaId: string, mesAtual: string, despesaIds: string[]) {
    const previsao = new PrevisaoDespesas(mesAtual);
    const inicio = somarMesesCompetencia(mesAtual, -3);
    previsao.faturamento = await faturamentoPorMes(m, empresaId, inicio, mesAtual);
    // Média dos três meses fechados: a melhor estimativa para o faturamento de meses que ainda não terminaram.
    const fechados = [1, 2, 3].map((k) => previsao.faturamento.get(somarMesesCompetencia(mesAtual, -k)) ?? 0);
    previsao.mediaFaturamento = Math.round(fechados.reduce((s, v) => s + v, 0) / 3);
    if (despesaIds.length) {
      // As três últimas contas reais (não estimadas e não canceladas) de cada despesa variável.
      const linhas: { despesa: string; media: string | null }[] = await m.query(
        `SELECT despesa, AVG(valor) AS media FROM (
           SELECT despesa_recorrente_id AS despesa, valor,
                  ROW_NUMBER() OVER (PARTITION BY despesa_recorrente_id ORDER BY competencia_recorrente DESC) AS ordem
             FROM contas_pagar
            WHERE empresa_id = $1 AND despesa_recorrente_id = ANY($2) AND NOT estimada AND status <> 'CANCELADA'
         ) ultimas WHERE ordem <= 3 GROUP BY despesa`,
        [empresaId, despesaIds],
      );
      previsao.mediasReais = new Map(linhas.map((l) => [l.despesa, l.media === null ? null : centavos(l.media)]));
    }
    return previsao;
  }

  valorEm(d: Pick<DespesaRecorrente, 'id' | 'tipoValor' | 'valor' | 'percentual'>, competencia: string): ValorPrevisto {
    if (d.tipoValor === TipoValorDespesa.FIXO) return { valor: d.valor!, estimado: false, base: 'Valor fixo' };
    if (d.tipoValor === TipoValorDespesa.ESTIMADO) {
      const media = this.mediasReais.get(d.id);
      return media
        ? { valor: reais(media), estimado: true, base: 'Média das últimas contas' }
        : { valor: d.valor!, estimado: true, base: 'Valor estimado no cadastro' };
    }
    // Sobre o faturamento do mês anterior ao vencimento: o real, se o mês já fechou. Se não fechou, o maior entre
    // o que já foi faturado no mês corrente e a média dos últimos 3 meses fechados, para não subestimar o imposto
    // de quem está faturando mais que a média.
    const mesBase = somarMesesCompetencia(competencia, -1);
    const pct = d.percentual!;
    const rotulo = `${pct.toLocaleString('pt-BR')}%`;
    if (mesBase < this.mesAtual) {
      return {
        valor: reais(Math.round(((this.faturamento.get(mesBase) ?? 0) * pct) / 100)),
        estimado: true,
        base: `${rotulo} do faturamento de ${mesBase.slice(5)}/${mesBase.slice(0, 4)}`,
      };
    }
    const atual = this.faturamento.get(this.mesAtual) ?? 0;
    const peloMesAtual = atual > this.mediaFaturamento;
    return {
      valor: reais(Math.round((Math.max(atual, this.mediaFaturamento) * pct) / 100)),
      estimado: true,
      base: peloMesAtual
        ? `${rotulo} do faturamento de ${this.mesAtual.slice(5)}/${this.mesAtual.slice(0, 4)} até agora`
        : `${rotulo} da média de faturamento dos últimos 3 meses`,
    };
  }
}
