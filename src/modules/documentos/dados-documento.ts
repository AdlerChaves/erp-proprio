import { dataHoraComFuso } from '../../common/datas';
import type { EnderecoDto } from '../../common/endereco.dto';
import { type ConfigProposta, PROPOSTA_PADRAO } from '../empresas/empresa.entity';
import { dividirEmParcelas, somarMeses } from '../financeiro/contas-financeiras.service';
import { municipio } from '../nfse/catalogos';
import type { DadosDocumento, GrupoItens, LinhaCartao, ParteDocumento, TipoDocumento } from './documento-pdf';

/** Textos prontos para o PDF, no formato brasileiro. */

/** "21/10/2026 14:30", no fuso da empresa. */
export const geradoEm = () => dataHoraComFuso().slice(0, 16).replace(/(\d{4})-(\d{2})-(\d{2})T/, '$3/$2/$1 ');

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const moeda = (valor: number) => MOEDA.format(valor).replace(/\u00a0/g, ' ');
const data = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function documento(valor: string | null) {
  if (!valor) return null;
  const d = valor.replace(/\D/g, '');
  if (d.length === 11) return `CPF ${d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
  if (d.length === 14) return `CNPJ ${d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
  return valor;
}

function telefone(valor: string | null) {
  const d = valor?.replace(/\D/g, '') ?? '';
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  return valor || null;
}

function endereco(e: EnderecoDto | null, codigoMunicipio?: string | null) {
  const linhas: string[] = [];
  if (e) linhas.push(`${e.logradouro}, ${e.numero}${e.complemento ? ` - ${e.complemento}` : ''} - ${e.bairro}`);
  const cidade = municipio(e?.codigoMunicipio ?? codigoMunicipio ?? '');
  const cep = e ? `CEP ${e.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}` : null;
  const linha = [cidade && `${cidade.nome} - ${cidade.uf}`, cep].filter(Boolean).join(' - ');
  if (linha) linhas.push(linha);
  return linhas;
}

/**
 * Parcelamento no cartão: até `parcelasSemJuros` vezes, o total é só dividido; acima disso, cada parcela segue a
 * tabela Price, com juros compostos de `jurosCartao`% ao mês (2% em 12x: 7.398,92 vira 12x de 699,64).
 */
export function simularCartao(total: number, c: Pick<ConfigProposta, 'jurosCartao' | 'parcelasCartao' | 'parcelasSemJuros'>) {
  const centavos = Math.round(total * 100);
  const i = c.jurosCartao / 100;
  return Array.from({ length: c.parcelasCartao }, (_, k) => {
    const n = k + 1;
    if (n <= c.parcelasSemJuros || i === 0) return { parcelas: n, parcela: Math.round(centavos / n) / 100, total: centavos / 100, semJuros: true };
    const parcela = Math.round((centavos * i) / (1 - (1 + i) ** -n));
    return { parcelas: n, parcela: parcela / 100, total: (parcela * n) / 100, semJuros: false };
  });
}

interface Pessoa {
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco?: EnderecoDto | null;
}

export interface EmpresaDocumento {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  inscricaoMunicipal: string | null;
  codigoMunicipio: string | null;
  telefone: string | null;
  email: string | null;
  endereco: EnderecoDto | null;
  proposta?: ConfigProposta | null;
  logo?: string | null;
}

interface Item {
  descricao: string;
  quantidade: number;
  total: number;
  precoUnitario?: number;
  custoUnitario?: number;
  desconto?: number;
  /** Sem tipo (pedido de compra), conta como produto. `imagem` só vem no PDF da venda. */
  produto: { codigo: string; unidade: string; tipo?: string; imagem?: string | null };
}

interface Documento {
  numero: number;
  dataEmissao: string;
  status: string;
  parcelas: number;
  primeiroVencimento: string | null;
  observacoes: string | null;
  total: number;
  itens: Item[];
  escopoServico?: string | null;
  exibirParcelamento?: boolean;
  contas: { valor: number; dataVencimento: string; parcela: number | null; totalParcelas: number | null; status: string }[];
}

const parteEmpresa = (e: EmpresaDocumento): DadosDocumento['empresa'] => ({
  nome: e.nomeFantasia || e.razaoSocial,
  razaoSocial: e.nomeFantasia ? e.razaoSocial : null,
  documento: documento(e.cnpj)!,
  inscricaoMunicipal: e.inscricaoMunicipal,
  endereco: endereco(e.endereco, e.codigoMunicipio),
  telefone: telefone(e.telefone),
  email: e.email,
  logo: e.logo ?? null,
});

const partePessoa = (p: Pessoa): ParteDocumento => ({
  nome: p.nome,
  documento: documento(p.documento),
  endereco: endereco(p.endereco ?? null),
  telefone: telefone(p.telefone),
  email: p.email,
});

/**
 * Parcelas: as contas já lançadas (venda faturada, compra recebida) ou a previsão pela condição de pagamento.
 * Sem primeiro vencimento, a conta vence no faturamento (ou recebimento): à vista.
 */
function pagamento(doc: Documento, momento: string): DadosDocumento['pagamento'] {
  const contas = doc.contas.filter((c) => c.status !== 'CANCELADA');
  if (contas.length) {
    return contas.map((c) => ({
      parcela: c.totalParcelas ? `${c.parcela}/${c.totalParcelas}` : 'Única',
      vencimento: data(c.dataVencimento),
      valor: moeda(c.valor),
    }));
  }
  if (!doc.primeiroVencimento) {
    return doc.parcelas === 1
      ? `À vista, ${momento}.`
      : `${doc.parcelas} parcelas mensais de cerca de ${moeda(doc.total / doc.parcelas)}, a primeira ${momento}.`;
  }
  return dividirEmParcelas(doc.total, doc.parcelas).map((valor, i) => ({
    parcela: doc.parcelas === 1 ? 'Única' : `${i + 1}/${doc.parcelas}`,
    vencimento: data(somarMeses(doc.primeiroVencimento!, i)),
    valor: moeda(valor),
  }));
}

/** Uma linha para o quadro "Forma de pagamento". */
function resumoPagamento(p: DadosDocumento['pagamento']) {
  if (typeof p === 'string') return p.replace(/\.$/, '');
  if (p.length === 1) return `Parcela única, vencimento em ${p[0].vencimento}`;
  return `${p.length} parcelas, de ${p[0].vencimento} a ${p[p.length - 1].vencimento}`;
}

/** "6 itens · 11 unidades"; as unidades só quando tudo é contado em unidades. */
function contar(lista: Item[]) {
  const emUnidades = lista.every((i) => i.produto.unidade.toUpperCase() === 'UN');
  const unidades = lista.reduce((s, i) => s + i.quantidade, 0);
  return [
    `${lista.length} ${lista.length === 1 ? 'item' : 'itens'}`,
    emUnidades && `${QTD.format(unidades)} ${unidades === 1 ? 'unidade' : 'unidades'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

const centavosDe = (lista: Item[]) => lista.reduce((s, i) => s + Math.round(i.total * 100), 0);

/** Itens separados em produtos e serviços (nessa ordem), cada grupo com seu subtotal. */
function itens(doc: Documento, comDesconto: boolean) {
  const linha = (i: Item) => ({
    codigo: i.produto.codigo,
    descricao: i.descricao,
    quantidade: QTD.format(i.quantidade),
    unidade: i.produto.unidade,
    unitario: moeda(i.precoUnitario ?? i.custoUnitario ?? 0),
    desconto: comDesconto && (i.desconto ?? 0) > 0 ? moeda(i.desconto!) : '',
    unitarioFinal: moeda(i.quantidade > 0 ? i.total / i.quantidade : 0),
    total: moeda(i.total),
    imagem: i.produto.imagem ?? null,
  });
  const servico = (i: Item) => i.produto.tipo === 'SERVICO';
  const grupos: GrupoItens[] = (
    [
      ['PRODUTO', doc.itens.filter((i) => !servico(i))],
      ['SERVICO', doc.itens.filter(servico)],
    ] as const
  )
    .filter(([, lista]) => lista.length)
    .map(([tipo, lista]) => ({ tipo, itens: lista.map(linha), contagem: contar(lista), subtotal: moeda(centavosDe(lista) / 100) }));
  const liquido = centavosDe(doc.itens);
  const descontos = doc.itens.reduce((s, i) => s + Math.round((i.desconto ?? 0) * 100), 0);
  return {
    grupos,
    contagem: contar(doc.itens),
    bruto: moeda((liquido + descontos) / 100),
    descontos: descontos > 0 ? moeda(descontos / 100) : null,
  };
}

/** Uma linha nas condições gerais sobre o que o serviço cobre. */
const ESCOPOS: Record<string, DadosDocumento['escopoServico']> = {
  MAO_DE_OBRA: { valor: 'Somente mão de obra', detalhe: 'Material não incluso no valor' },
  MATERIAL_INCLUSO: { valor: 'Material e mão de obra', detalhe: 'Material incluso no valor' },
};

function linhasCartao(total: number, config: ConfigProposta): { linhas: LinhaCartao[]; resumo: string } {
  const simulacao = simularCartao(total, config);
  const maior = simulacao[simulacao.length - 1];
  return {
    linhas: [
      { condicao: 'À vista (Pix ou boleto)', observacao: null, parcela: moeda(total), total: moeda(total) },
      ...simulacao.map((s) => ({
        condicao: `${s.parcelas}x no cartão`,
        observacao: s.semJuros ? 'sem acréscimo' : null,
        parcela: moeda(s.parcela),
        total: moeda(s.total),
      })),
    ],
    resumo: `${maior.parcelas}x de ${moeda(maior.parcela)}`,
  };
}

export function dadosVenda(
  venda: Documento & { cliente: Pessoa },
  empresa: EmpresaDocumento,
  geradoEm: string,
  responsavel: string | null = null,
): DadosDocumento {
  const tipo: TipoDocumento = venda.status === 'ORCAMENTO' ? 'ORCAMENTO' : venda.status === 'FATURADA' ? 'VENDA' : 'PEDIDO';
  const config = { ...PROPOSTA_PADRAO, ...empresa.proposta };
  const comDesconto = venda.itens.some((i) => (i.desconto ?? 0) > 0);
  const lista = itens(venda, comDesconto);
  const condicao = pagamento(venda, 'no faturamento');
  const orcamento = tipo === 'ORCAMENTO';
  const cartao = orcamento && config.simularCartao && venda.exibirParcelamento !== false && venda.total > 0 ? linhasCartao(venda.total, config) : null;
  return {
    tipo,
    numero: venda.numero,
    emissao: data(venda.dataEmissao),
    cancelado: venda.status === 'CANCELADA',
    empresa: parteEmpresa(empresa),
    destaques: config.destaques,
    responsavel,
    validade:
      orcamento && config.validadeDias
        ? { ate: data(somarDias(venda.dataEmissao, config.validadeDias)), dias: config.validadeDias }
        : null,
    rotuloPessoa: 'Cliente',
    pessoa: partePessoa(venda.cliente),
    comDesconto,
    ...lista,
    total: moeda(venda.total),
    cartao,
    pagamento: condicao,
    // No orçamento sem condição combinada, a forma é a escolha do cliente entre as da tabela.
    formaPagamento:
      cartao && typeof condicao === 'string' && venda.parcelas === 1
        ? `Pix ou boleto à vista, ou cartão em até ${cartao.linhas.length - 1}x`
        : resumoPagamento(condicao),
    prazoEntrega: config.prazoEntrega,
    garantia: config.garantia,
    condicoes: config.condicoes,
    escopoServico: (venda.escopoServico && ESCOPOS[venda.escopoServico]) || null,
    observacoes: venda.observacoes,
    geradoEm,
  };
}

export function dadosCompra(
  compra: Documento & { fornecedor: Pessoa },
  empresa: EmpresaDocumento,
  geradoEm: string,
  responsavel: string | null = null,
): DadosDocumento {
  const lista = itens(compra, false);
  const condicao = pagamento(compra, 'no recebimento');
  return {
    tipo: 'PEDIDO_COMPRA',
    numero: compra.numero,
    emissao: data(compra.dataEmissao),
    cancelado: compra.status === 'CANCELADA',
    empresa: parteEmpresa(empresa),
    // Destaques, validade e condições comerciais são para clientes; o pedido de compra vai ao fornecedor.
    destaques: [],
    responsavel,
    validade: null,
    rotuloPessoa: 'Fornecedor',
    pessoa: partePessoa(compra.fornecedor),
    comDesconto: false,
    ...lista,
    descontos: null,
    total: moeda(compra.total),
    cartao: null,
    pagamento: condicao,
    formaPagamento: resumoPagamento(condicao),
    prazoEntrega: null,
    garantia: null,
    condicoes: null,
    escopoServico: null,
    observacoes: compra.observacoes,
    geradoEm,
  };
}
