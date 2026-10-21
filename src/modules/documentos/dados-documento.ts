import { dataHoraComFuso } from '../../common/datas';
import type { EnderecoDto } from '../../common/endereco.dto';
import { dividirEmParcelas, somarMeses } from '../financeiro/contas-financeiras.service';
import { municipio } from '../nfse/catalogos';
import type { DadosDocumento, ParteDocumento, TipoDocumento } from './documento-pdf';

/** Textos prontos para o PDF, no formato brasileiro. */

/** "21/10/2026 14:30", no fuso da empresa. */
export const geradoEm = () => dataHoraComFuso().slice(0, 16).replace(/(\d{4})-(\d{2})-(\d{2})T/, '$3/$2/$1 ');

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const moeda = (valor: number) => MOEDA.format(valor).replace(/ /g, ' ');
const data = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

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

const contato = (tel: string | null, email: string | null) => [telefone(tel), email].filter(Boolean).join(' · ') || null;

interface Pessoa {
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco?: EnderecoDto | null;
}

interface Empresa {
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  inscricaoMunicipal: string | null;
  codigoMunicipio: string | null;
  telefone: string | null;
  email: string | null;
  endereco: EnderecoDto | null;
}

interface Item {
  descricao: string;
  quantidade: number;
  total: number;
  precoUnitario?: number;
  custoUnitario?: number;
  desconto?: number;
  produto: { codigo: string; unidade: string };
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
  contas: { valor: number; dataVencimento: string; parcela: number | null; totalParcelas: number | null; status: string }[];
}

const parteEmpresa = (e: Empresa): DadosDocumento['empresa'] => ({
  nome: e.nomeFantasia || e.razaoSocial,
  razaoSocial: e.nomeFantasia ? e.razaoSocial : null,
  documento: documento(e.cnpj)!,
  inscricaoMunicipal: e.inscricaoMunicipal,
  endereco: endereco(e.endereco, e.codigoMunicipio),
  contato: contato(e.telefone, e.email),
});

const partePessoa = (p: Pessoa): ParteDocumento => ({
  nome: p.nome,
  documento: documento(p.documento),
  endereco: endereco(p.endereco ?? null),
  contato: contato(p.telefone, p.email),
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

function itens(doc: Documento, comDesconto: boolean) {
  let bruto = 0;
  let descontos = 0;
  const linhas = doc.itens.map((i) => {
    const unitario = i.precoUnitario ?? i.custoUnitario ?? 0;
    const desconto = i.desconto ?? 0;
    bruto += Math.round(i.total * 100) + Math.round(desconto * 100);
    descontos += Math.round(desconto * 100);
    return {
      codigo: i.produto.codigo,
      descricao: i.descricao,
      quantidade: QTD.format(i.quantidade),
      unidade: i.produto.unidade,
      unitario: moeda(unitario),
      desconto: comDesconto && desconto > 0 ? moeda(desconto) : '',
      total: moeda(i.total),
    };
  });
  return { linhas, subtotal: moeda(bruto / 100), descontos: descontos > 0 ? moeda(descontos / 100) : null };
}

export function dadosVenda(venda: Documento & { cliente: Pessoa }, empresa: Empresa, geradoEm: string): DadosDocumento {
  const tipo: TipoDocumento = venda.status === 'ORCAMENTO' ? 'ORCAMENTO' : venda.status === 'FATURADA' ? 'VENDA' : 'PEDIDO';
  const comDesconto = venda.itens.some((i) => (i.desconto ?? 0) > 0);
  const { linhas, subtotal, descontos } = itens(venda, comDesconto);
  return {
    tipo,
    numero: venda.numero,
    emissao: data(venda.dataEmissao),
    cancelado: venda.status === 'CANCELADA',
    empresa: parteEmpresa(empresa),
    rotuloPessoa: 'Cliente',
    pessoa: partePessoa(venda.cliente),
    comDesconto,
    itens: linhas,
    subtotal,
    descontos,
    total: moeda(venda.total),
    pagamento: pagamento(venda, 'no faturamento'),
    observacoes: venda.observacoes,
    geradoEm,
  };
}

export function dadosCompra(compra: Documento & { fornecedor: Pessoa }, empresa: Empresa, geradoEm: string): DadosDocumento {
  const { linhas, subtotal } = itens(compra, false);
  return {
    tipo: 'PEDIDO_COMPRA',
    numero: compra.numero,
    emissao: data(compra.dataEmissao),
    cancelado: compra.status === 'CANCELADA',
    empresa: parteEmpresa(empresa),
    rotuloPessoa: 'Fornecedor',
    pessoa: partePessoa(compra.fornecedor),
    comDesconto: false,
    itens: linhas,
    subtotal,
    descontos: null,
    total: moeda(compra.total),
    pagamento: pagamento(compra, 'no recebimento'),
    observacoes: compra.observacoes,
    geradoEm,
  };
}
