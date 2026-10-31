import { DOMParser } from '@xmldom/xmldom';
import type { Content, CustomTableLayout, TDocumentDefinitions } from 'pdfmake/interfaces';
import { dataHoraComFuso } from '../../common/datas';
import { documento, telefone } from '../documentos/dados-documento';
import { municipio } from './catalogos';

/**
 * DANFSe: documento auxiliar (representação em PDF) da NFS-e nacional, montado só com o XML da NFS-e que a
 * Sefin devolveu. Segue as seções do DANFSe do Emissor Nacional; o QR Code leva à consulta pública da nota.
 */

export const URL_CONSULTA_PUBLICA = 'https://www.nfse.gov.br/ConsultaPublica';
export const qrConsulta = (chave: string) => `${URL_CONSULTA_PUBLICA}/?tpc=1&chave=${chave}`;

const ESCURO = '#212529';
const CINZA = '#868e96';
const LINHA = '#ced4da';

const OPCAO_SIMPLES: Record<string, string> = {
  '1': 'Não optante',
  '2': 'Optante - Microempreendedor Individual (MEI)',
  '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
};
const APURACAO_SIMPLES: Record<string, string> = {
  '1': 'Tributos federais e municipal pelo Simples Nacional',
  '2': 'Tributos federais pelo Simples Nacional e ISSQN fora dele',
  '3': 'Tributos federais e municipal fora do Simples Nacional',
};
const TRIBUTACAO_ISSQN: Record<string, string> = {
  '1': 'Operação tributável',
  '2': 'Imunidade',
  '3': 'Exportação de serviço',
  '4': 'Não incidência',
};
const RETENCAO_ISSQN: Record<string, string> = {
  '1': 'Não retido',
  '2': 'Retido pelo tomador',
  '3': 'Retido pelo intermediário',
};

/** Primeiro elemento com esse nome (sem prefixo) dentro de `pai`, em qualquer nível. */
function elemento(pai: Element | null | undefined, nome: string): Element | null {
  if (!pai) return null;
  const lista = pai.getElementsByTagNameNS('*', nome);
  return lista.length ? lista[0] : null;
}
const valor = (pai: Element | null | undefined, nome: string) => elemento(pai, nome)?.textContent?.trim() || null;

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moeda = (v: string | null) => (v === null ? null : MOEDA.format(Number(v)).replace(/ /g, ' '));
const percentual = (v: string | null) => (v === null ? null : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const data = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);
/** "2026-10-30T14:05:09-03:00" → "30/10/2026 14:05:09". */
const dataHora = (iso: string | null) => (iso ? `${data(iso)} ${iso.slice(11, 19)}` : null);
const cep = (v: string | null) => v?.replace(/(\d{5})(\d{3})/, '$1-$2') ?? null;
const cidade = (codigo: string | null) => {
  const m = codigo ? municipio(codigo) : undefined;
  return m ? `${m.nome} - ${m.uf}` : codigo;
};
/** A chave em grupos de 4 dígitos, como nos documentos fiscais impressos. */
export const chaveFormatada = (chave: string) => chave.replace(/(\d{4})(?=\d)/g, '$1 ');

/** Endereço nacional do emitente (enderNac) ou do tomador (end/endNac). */
function endereco(e: Element | null) {
  if (!e) return null;
  const numero = [valor(e, 'xLgr'), valor(e, 'nro')].filter(Boolean).join(', ');
  const linha = [numero, valor(e, 'xCpl'), valor(e, 'xBairro')].filter(Boolean).join(' - ');
  const local = [cidade(valor(e, 'cMun')), cep(valor(e, 'CEP')) && `CEP ${cep(valor(e, 'CEP'))}`].filter(Boolean).join(' - ');
  return [linha, local].filter(Boolean).join('\n') || null;
}

const COLUNAS = 4;

/**
 * Campo do quadro (rótulo pequeno em cinza, valor embaixo) ocupando `colunas` das 4 colunas da seção:
 * devolve a célula e as vagas que o pdfmake exige depois de um colSpan.
 */
function campo(rotulo: string, conteudo: string | null, colunas = 1, destaque = false): Content[] {
  const celula = {
    stack: [
      { text: rotulo, fontSize: 6.5, color: CINZA },
      { text: conteudo ?? '-', fontSize: destaque ? 11 : 8.5, bold: destaque, color: ESCURO },
    ],
    colSpan: colunas,
  };
  return [celula, ...Array.from({ length: colunas - 1 }, () => ({ text: '' }))];
}

const quadro: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => LINHA,
  vLineColor: () => LINHA,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

/** Seção com título em faixa e linhas de campos que somam 4 colunas. */
function secao(titulo: string, linhas: Content[][]): Content {
  const faixa = { text: titulo, bold: true, fontSize: 8, color: ESCURO, fillColor: '#f1f3f5', colSpan: COLUNAS };
  return {
    table: {
      widths: Array(COLUNAS).fill('*'),
      body: [[faixa, ...Array.from({ length: COLUNAS - 1 }, () => ({ text: '' }))], ...linhas] as never,
    },
    layout: quadro,
    margin: [0, 0, 0, 6],
  };
}

export function montarDanfse(xml: string, situacao: { cancelada: boolean }): TDocumentDefinitions {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const inf = elemento(doc.documentElement, 'infNFSe');
  const dps = elemento(inf, 'infDPS');
  if (!inf || !dps) throw new Error('XML da NFS-e sem infNFSe ou sem a DPS');

  const chave = inf.getAttribute('Id')!.replace(/^NFS/, '');
  const emit = elemento(inf, 'emit');
  const prest = elemento(dps, 'prest');
  const toma = elemento(dps, 'toma');
  const serv = elemento(dps, 'serv');
  const valoresDps = elemento(dps, 'valores');
  const valoresNfse = Array.from(inf.childNodes).find((n) => (n as Element).localName === 'valores') as Element | undefined;
  const tribMun = elemento(valoresDps, 'tribMun');
  const homologacao = valor(dps, 'tpAmb') === '2';
  const retido = valor(tribMun, 'tpRetISSQN') === '2' || valor(tribMun, 'tpRetISSQN') === '3';

  const emitDoc = valor(emit, 'CNPJ') ?? valor(emit, 'CPF');
  const tomaDoc = valor(toma, 'CNPJ') ?? valor(toma, 'CPF') ?? valor(toma, 'NIF');
  const tributos = valor(valoresDps, 'pTotTribSN')
    ? `Simples Nacional: ${percentual(valor(valoresDps, 'pTotTribSN'))} do valor do serviço`
    : valor(valoresDps, 'vTotTribFed') || valor(valoresDps, 'pTotTribFed')
      ? 'Informados por esfera no XML da NFS-e'
      : 'Não informados';

  const cabecalho: Content = {
    columns: [
      {
        width: '*',
        stack: [
          { text: 'DANFSe', bold: true, fontSize: 16, color: ESCURO },
          { text: 'Documento Auxiliar da Nota Fiscal de Serviço eletrônica', fontSize: 8.5, color: ESCURO },
          { text: `NFS-e emitida em ${valor(inf, 'xLocEmi') ?? '-'} pelo Emissor Nacional`, fontSize: 7.5, color: CINZA, margin: [0, 2, 0, 0] },
          homologacao
            ? { text: 'AMBIENTE DE HOMOLOGAÇÃO (PRODUÇÃO RESTRITA) - SEM VALOR FISCAL', bold: true, fontSize: 8, color: '#e03131', margin: [0, 4, 0, 0] }
            : '',
          situacao.cancelada ? { text: 'NFS-e CANCELADA', bold: true, fontSize: 10, color: '#e03131', margin: [0, 4, 0, 0] } : '',
        ],
      },
      {
        width: 'auto',
        stack: [
          { qr: qrConsulta(chave), fit: 78, alignment: 'right' },
          { text: 'Consulte a autenticidade', fontSize: 6, color: CINZA, alignment: 'right', margin: [0, 2, 0, 0] },
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  const identificacao = secao('IDENTIFICAÇÃO DA NFS-e', [
    [...campo('Chave de acesso', chaveFormatada(chave), 3), ...campo('Número da NFS-e', valor(inf, 'nNFSe'))],
    [
      ...campo('Competência', data(valor(dps, 'dCompet'))),
      ...campo('Emissão da NFS-e', dataHora(valor(inf, 'dhProc'))),
      ...campo('Número / série da DPS', `${valor(dps, 'nDPS') ?? '-'} / ${valor(dps, 'serie') ?? '-'}`),
      ...campo('Emissão da DPS', dataHora(valor(dps, 'dhEmi'))),
    ],
  ]);

  const emitente = secao('PRESTADOR / EMITENTE', [
    [...campo('Nome / razão social', valor(emit, 'xNome'), 2), ...campo('CNPJ / CPF', documento(emitDoc)), ...campo('Inscrição municipal', valor(emit, 'IM'))],
    [...campo('Endereço', endereco(elemento(emit, 'enderNac')), 2), ...campo('Telefone', telefone(valor(emit, 'fone'))), ...campo('E-mail', valor(emit, 'email'))],
    [
      ...campo('Simples Nacional', OPCAO_SIMPLES[valor(prest, 'opSimpNac') ?? ''] ?? null, 2),
      ...campo('Regime de apuração', APURACAO_SIMPLES[valor(prest, 'regApTribSN') ?? ''] ?? null, 2),
    ],
  ]);

  const tomador = secao(
    'TOMADOR DO SERVIÇO',
    toma
      ? [
          [...campo('Nome / razão social', valor(toma, 'xNome'), 2), ...campo('CNPJ / CPF', documento(tomaDoc)), ...campo('Inscrição municipal', valor(toma, 'IM'))],
          [...campo('Endereço', endereco(elemento(toma, 'end')), 2), ...campo('Telefone', telefone(valor(toma, 'fone'))), ...campo('E-mail', valor(toma, 'email'))],
        ]
      : [campo('Tomador', 'Não identificado na NFS-e', 4)],
  );

  const servico = secao('SERVIÇO PRESTADO', [
    [
      ...campo('Código de tributação nacional', [valor(serv, 'cTribNac'), valor(inf, 'xTribNac')].filter(Boolean).join(' - '), 3),
      ...campo('Código NBS', valor(serv, 'cNBS')),
    ],
    [
      ...campo('Local da prestação', valor(inf, 'xLocPrestacao') ?? cidade(valor(serv, 'cLocPrestacao')), 2),
      ...campo('Município de incidência do ISSQN', valor(inf, 'xLocIncid'), 2),
    ],
    campo('Descrição do serviço', valor(serv, 'xDescServ'), 4),
  ]);

  const tributacao = secao('TRIBUTAÇÃO MUNICIPAL (ISSQN)', [
    [
      ...campo('Tributação do ISSQN', TRIBUTACAO_ISSQN[valor(tribMun, 'tribISSQN') ?? ''] ?? null),
      ...campo('Retenção do ISSQN', RETENCAO_ISSQN[valor(tribMun, 'tpRetISSQN') ?? ''] ?? null),
      ...campo('Base de cálculo', moeda(valor(valoresNfse, 'vBC'))),
      ...campo('Alíquota', percentual(valor(valoresNfse, 'pAliqAplic') ?? valor(tribMun, 'pAliq'))),
    ],
    [...campo('ISSQN apurado', moeda(valor(valoresNfse, 'vISSQN'))), ...campo('Tributos aproximados', tributos, 3)],
  ]);

  const totais = secao('VALOR TOTAL DA NFS-e', [
    [
      ...campo('Valor do serviço', moeda(valor(valoresDps, 'vServ'))),
      ...campo('Desconto incondicionado', moeda(valor(valoresDps, 'vDescIncond') ?? '0')),
      ...campo('Desconto condicionado', moeda(valor(valoresDps, 'vDescCond') ?? '0')),
      ...campo('ISSQN retido', moeda(retido ? valor(valoresNfse, 'vISSQN') : '0')),
    ],
    [...campo('Total de retenções', moeda(valor(valoresNfse, 'vTotalRet') ?? '0'), 2), ...campo('Valor líquido da NFS-e', moeda(valor(valoresNfse, 'vLiq')), 2, true)],
  ]);

  const complementares = [valor(inf, 'xOutInf'), valor(dps, 'xInfComp')].filter(Boolean).join('\n');

  return {
    pageSize: 'A4',
    pageMargins: [36, 30, 36, 46],
    info: { title: `DANFSe ${valor(inf, 'nNFSe') ?? chave}`, creator: 'Relda ERP' },
    defaultStyle: { font: 'Helvetica', fontSize: 8.5, lineHeight: 1.1 },
    watermark: situacao.cancelada
      ? { text: 'CANCELADA', color: '#e03131', opacity: 0.15, bold: true }
      : homologacao
        ? { text: 'SEM VALOR FISCAL', color: '#e03131', opacity: 0.12, bold: true }
        : undefined,
    footer: () => ({
      columns: [
        { text: `Consulte em ${URL_CONSULTA_PUBLICA} pela chave de acesso.`, fontSize: 7, color: CINZA },
        { text: `Gerado em ${dataHora(dataHoraComFuso())} pelo Relda ERP`, fontSize: 7, color: CINZA, alignment: 'right' },
      ],
      margin: [36, 20, 36, 0],
    }),
    content: [
      cabecalho,
      identificacao,
      emitente,
      tomador,
      servico,
      tributacao,
      totais,
      ...(complementares ? [secao('INFORMAÇÕES COMPLEMENTARES', [campo('Informações', complementares, 4)])] : []),
    ],
  };
}
