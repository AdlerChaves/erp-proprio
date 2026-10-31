import type { EnderecoDto } from '../../common/endereco.dto';
import { RegimeTributario } from '../empresas/empresa.entity';
import { validarXml, VERSAO_LEIAUTE } from './esquemas';

export { PADRAO_SERIE_OFICIAL } from './esquemas';

/**
 * Declaração de Prestação de Serviços (DPS) no leiaute nacional da NFS-e, versão 1.01.
 * As regras citadas (E0xxx) são as do Anexo I da documentação técnica (gov.br/nfse).
 */
export const VERSAO_DPS = VERSAO_LEIAUTE;
export const VERSAO_APLICATIVO = 'erp-proprio-0.1';

export interface DadosDps {
  ambiente: number;
  /** dhEmi, já no formato AAAA-MM-DDThh:mm:ss±hh:mm. */
  dataHoraEmissao: string;
  serie: string;
  numero: number;
  dataCompetencia: string;
  /** Código IBGE do município emissor: o do cadastro do prestador. */
  municipioEmissor: string;
  prestador: {
    cnpj: string;
    inscricaoMunicipal: string | null;
    regime: RegimeTributario;
    regimeApuracaoSimples: number;
    /** pTotTribSN, para ME/EPP do Simples. */
    aliquotaSimples: number | null;
  };
  tomador: {
    documento: string;
    nome: string;
    inscricaoMunicipal: string | null;
    endereco: EnderecoDto | null;
    telefone: string | null;
    email: string | null;
  };
  servico: {
    codigoTributacaoNacional: string;
    codigoNbs: string | null;
    descricao: string;
    municipioPrestacao: string;
  };
  valores: {
    servicos: number;
    descontoIncondicionado: number;
    issRetido: boolean;
    aliquotaIss: number | null;
  };
}

/** Situação perante o Simples (opSimpNac): 1 não optante, 2 MEI, 3 ME/EPP. */
const OPCAO_SIMPLES: Record<RegimeTributario, number> = {
  [RegimeTributario.LUCRO_PRESUMIDO]: 1,
  [RegimeTributario.LUCRO_REAL]: 1,
  [RegimeTributario.MEI]: 2,
  [RegimeTributario.SIMPLES_NACIONAL]: 3,
};

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * Os campos de texto simples da DPS só aceitam caracteres até U+00FF (Latin-1), sem espaço nas pontas.
 * Troca o que for possível pela forma sem acento composto e descarta o resto.
 */
export function texto(valor: string, maximo: number) {
  const latin1 = [...valor.normalize('NFC')]
    .map((c) => (c.charCodeAt(0) <= 0xff ? c : c.normalize('NFD').replace(/[^\x00-\xff]/g, '')))
    .join('');
  return escapar(latin1.replace(/\s+/g, ' ').trim().slice(0, maximo));
}

/** Descrição do serviço: aceita quebras de linha e qualquer caractere, até 2000. */
const descricao = (valor: string) => escapar(valor.trim().slice(0, 2000));

const decimal = (valor: number) => valor.toFixed(2);
const digitos = (valor: string) => valor.replace(/\D/g, '');

export const tag = (nome: string, conteudo: string | null | undefined | false) =>
  conteudo === null || conteudo === undefined || conteudo === false || conteudo === '' ? '' : `<${nome}>${conteudo}</${nome}>`;

/** Identificador: "DPS" + município (7) + tipo de inscrição (1) + CNPJ/CPF (14) + série (5) + número (15). */
export function idDps(d: Pick<DadosDps, 'municipioEmissor' | 'serie' | 'numero'> & { cnpj: string }) {
  return `DPS${d.municipioEmissor}2${d.cnpj}${d.serie.padStart(5, '0')}${String(d.numero).padStart(15, '0')}`;
}

export function gerarDps(d: DadosDps) {
  const opSimpNac = OPCAO_SIMPLES[d.prestador.regime];
  if (opSimpNac === 1) {
    // Não optantes informam o total de tributos por esfera (vTotTrib ou pTotTrib), que o ERP ainda não calcula.
    throw new Error('A emissão de nota de serviço ainda só está disponível para empresas do Simples Nacional e MEI');
  }
  const meEpp = opSimpNac === 3;
  const apuraIssNoSimples = meEpp && d.prestador.regimeApuracaoSimples === 1;

  const docTomador = digitos(d.tomador.documento);
  const end = d.tomador.endereco;
  const fone = d.tomador.telefone && digitos(d.tomador.telefone);

  // pAliq: no Simples com ISS apurado no Simples, só quando há retenção (E0625/E0628); MEI nunca (E0600);
  // ME/EPP com ISS fora do Simples, a alíquota vem da parametrização do município (E0635).
  const informaAliquota = apuraIssNoSimples && d.valores.issRetido;
  // Total de tributos: ME/EPP informa o percentual do Simples (E0712); MEI usa o indicador "não informar" (E0710).
  const totTrib = meEpp ? tag('pTotTribSN', decimal(d.prestador.aliquotaSimples ?? 0)) : tag('indTotTrib', '0');

  const id = idDps({ ...d, cnpj: d.prestador.cnpj });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="${VERSAO_DPS}">` +
    `<infDPS Id="${id}">` +
    tag('tpAmb', String(d.ambiente)) +
    tag('dhEmi', d.dataHoraEmissao) +
    tag('verAplic', VERSAO_APLICATIVO) +
    tag('serie', d.serie) +
    tag('nDPS', String(d.numero)) +
    tag('dCompet', d.dataCompetencia) +
    tag('tpEmit', '1') +
    tag('cLocEmi', d.municipioEmissor) +
    // Emitente prestador: sem nome nem endereço (E0121, E0128); a inscrição municipal, se houver.
    '<prest>' +
    tag('CNPJ', d.prestador.cnpj) +
    tag('IM', d.prestador.inscricaoMunicipal && texto(d.prestador.inscricaoMunicipal, 15)) +
    '<regTrib>' +
    tag('opSimpNac', String(opSimpNac)) +
    (meEpp ? tag('regApTribSN', String(d.prestador.regimeApuracaoSimples)) : '') +
    tag('regEspTrib', '0') +
    '</regTrib>' +
    '</prest>' +
    '<toma>' +
    tag(docTomador.length === 14 ? 'CNPJ' : 'CPF', docTomador) +
    tag('IM', d.tomador.inscricaoMunicipal && texto(d.tomador.inscricaoMunicipal, 15)) +
    tag('xNome', texto(d.tomador.nome, 300)) +
    (end
      ? '<end>' +
        `<endNac>${tag('cMun', end.codigoMunicipio)}${tag('CEP', end.cep)}</endNac>` +
        tag('xLgr', texto(end.logradouro, 255)) +
        tag('nro', texto(end.numero, 60)) +
        tag('xCpl', end.complemento && texto(end.complemento, 156)) +
        tag('xBairro', texto(end.bairro, 60)) +
        '</end>'
      : '') +
    tag('fone', fone && fone.length >= 6 && fone.length <= 20 ? fone : null) +
    tag('email', d.tomador.email && texto(d.tomador.email, 80)) +
    '</toma>' +
    '<serv>' +
    `<locPrest>${tag('cLocPrestacao', d.servico.municipioPrestacao)}</locPrest>` +
    '<cServ>' +
    tag('cTribNac', d.servico.codigoTributacaoNacional) +
    tag('xDescServ', descricao(d.servico.descricao)) +
    tag('cNBS', d.servico.codigoNbs) +
    '</cServ>' +
    '</serv>' +
    '<valores>' +
    `<vServPrest>${tag('vServ', decimal(d.valores.servicos))}</vServPrest>` +
    (d.valores.descontoIncondicionado > 0
      ? `<vDescCondIncond>${tag('vDescIncond', decimal(d.valores.descontoIncondicionado))}</vDescCondIncond>`
      : '') +
    '<trib>' +
    '<tribMun>' +
    tag('tribISSQN', '1') +
    tag('tpRetISSQN', d.valores.issRetido ? '2' : '1') +
    tag('pAliq', informaAliquota && decimal(d.valores.aliquotaIss ?? 0)) +
    '</tribMun>' +
    `<totTrib>${totTrib}</totTrib>` +
    '</trib>' +
    '</valores>' +
    '</infDPS>' +
    '</DPS>'
  );
}

/** Troca o dhEmi de uma DPS ainda não assinada (a data de emissão vale a do envio, não a da geração). */
export const comDataHoraEmissao = (xml: string, dataHora: string) => xml.replace(/<dhEmi>[^<]*<\/dhEmi>/, tag('dhEmi', dataHora));

/** O Id do infDPS, que identifica a DPS na Sefin. */
export const idDoXml = (xml: string) => xml.match(/<infDPS Id="([^"]+)"/)?.[1] ?? null;

/** Valida a DPS contra o XSD oficial; devolve as mensagens de erro (vazio se estiver válida). */
export const validarDps = (xml: string) => validarXml(xml, 'dps');
