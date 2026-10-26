import pdfmake from 'pdfmake';
import type { Content, ContentTable, CustomTableLayout, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * Orçamento, pedido de venda e pedido de compra em PDF. O montador recebe os dados já formatados
 * (texto pronto) e devolve o layout; assim o conteúdo é testável sem ler o PDF.
 */

export type TipoDocumento = 'ORCAMENTO' | 'PEDIDO' | 'VENDA' | 'PEDIDO_COMPRA';

const TITULOS: Record<TipoDocumento, string> = {
  ORCAMENTO: 'ORÇAMENTO',
  PEDIDO: 'PEDIDO DE VENDA',
  VENDA: 'VENDA',
  PEDIDO_COMPRA: 'PEDIDO DE COMPRA',
};

const ROTULO_NUMERO: Record<TipoDocumento, string> = {
  ORCAMENTO: 'Número da proposta',
  PEDIDO: 'Número do pedido',
  VENDA: 'Número da venda',
  PEDIDO_COMPRA: 'Número do pedido',
};

export interface ParteDocumento {
  nome: string;
  documento: string | null;
  /** Linhas de endereço já formatadas ("Rua X, 10 - Centro", "Várzea Paulista - SP - CEP 13220-000"). */
  endereco: string[];
  telefone: string | null;
  email: string | null;
}

export interface LinhaCartao {
  condicao: string;
  /** "sem acréscimo" nas parcelas sem juros. */
  observacao: string | null;
  parcela: string;
  total: string;
}

export interface LinhaItem {
  codigo: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  unitario: string;
  desconto: string;
  unitarioFinal: string;
  total: string;
  /** Foto do produto em data URL (PNG ou JPEG). */
  imagem: string | null;
}

/** Produtos ou serviços: cada grupo tem sua tabela e seu subtotal. */
export interface GrupoItens {
  tipo: 'PRODUTO' | 'SERVICO';
  itens: LinhaItem[];
  contagem: string;
  subtotal: string;
}

export interface DadosDocumento {
  tipo: TipoDocumento;
  numero: number;
  emissao: string;
  cancelado: boolean;
  empresa: Omit<ParteDocumento, 'documento'> & {
    documento: string;
    /** Razão social, quando o nome exibido é o fantasia. */
    razaoSocial: string | null;
    inscricaoMunicipal: string | null;
    /** data URL de PNG ou JPEG. */
    logo: string | null;
  };
  /** Frases curtas na faixa abaixo do cabeçalho. */
  destaques: string[];
  /** Quem gerou o documento. */
  responsavel: string | null;
  validade: { ate: string; dias: number } | null;
  /** "Cliente" ou "Fornecedor". */
  rotuloPessoa: string;
  pessoa: ParteDocumento;
  comDesconto: boolean;
  /** Produtos antes dos serviços; só os grupos que têm itens. */
  grupos: GrupoItens[];
  /** "6 itens · 11 unidades", de todos os grupos. */
  contagem: string;
  /** Soma dos itens antes dos descontos. */
  bruto: string;
  descontos: string | null;
  total: string;
  /** Tabela de parcelamento no cartão (só em orçamentos). */
  cartao: { linhas: LinhaCartao[]; resumo: string } | null;
  /** Uma linha por parcela, ou a condição em texto ("À vista, no faturamento"). */
  pagamento: { parcela: string; vencimento: string; valor: string }[] | string;
  /** Resumo para o quadro "Forma de pagamento". */
  formaPagamento: string;
  prazoEntrega: string | null;
  garantia: string | null;
  condicoes: string | null;
  /** O que o serviço cobre (só mão de obra ou material incluso), nas condições gerais. */
  escopoServico: { valor: string; detalhe: string } | null;
  observacoes: string | null;
  geradoEm: string;
}

const COR = '#0ca678';
const ESCURO = '#212529';
const TEXTO = '#343a40';
const CINZA = '#868e96';
const LINHA = '#dee2e6';
const FUNDO = '#f8f9fa';
const LARGURA = 523;

/** Título de seção; `headlineLevel` marca o título para não ficar sozinho no fim da página (ver pageBreakBefore). */
const titulo = (texto: string): Content => ({
  stack: [
    { text: texto, bold: true, fontSize: 11, color: ESCURO, headlineLevel: 1 },
    { canvas: [{ type: 'line', x1: 0, y1: 3, x2: LARGURA, y2: 3, lineWidth: 0.5, lineColor: LINHA }] },
  ],
  margin: [0, 16, 0, 8],
});

/** Borda fina em volta e entre as linhas, sem linhas verticais internas. */
const grade: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: (i, node) => (i === 0 || i === node.table.widths!.length ? 0.5 : 0),
  hLineColor: () => LINHA,
  vLineColor: () => LINHA,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

const caixa = (fundo: string | null, borda: string | null): CustomTableLayout => ({
  hLineWidth: () => (borda ? 0.75 : 0),
  vLineWidth: () => (borda ? 0.75 : 0),
  hLineColor: () => borda ?? LINHA,
  vLineColor: () => borda ?? LINHA,
  fillColor: () => fundo,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 8,
  paddingBottom: () => 8,
});

/** Tabela de duas colunas (rótulo: valor), sem bordas. */
const ficha = (linhas: [string, string | null][], larguraRotulo: number): Content => ({
  table: {
    widths: [larguraRotulo, '*'],
    body: linhas
      .filter((l): l is [string, string] => !!l[1])
      .map(([rotulo, valor]) => [
        { text: rotulo, color: CINZA },
        { text: valor, color: ESCURO },
      ]),
  },
  layout: { defaultBorder: false, paddingLeft: () => 0, paddingRight: () => 6, paddingTop: () => 2, paddingBottom: () => 2 },
  fontSize: 8.5,
});

function cabecalho(d: DadosDocumento): Content {
  const e = d.empresa;
  return {
    columns: [
      e.logo
        ? { width: 200, image: e.logo, fit: [190, 64] }
        : {
            width: '*',
            stack: [
              { text: e.nome, fontSize: 18, bold: true, color: COR },
              ...(e.razaoSocial ? [{ text: e.razaoSocial, fontSize: 8, color: CINZA }] : []),
            ],
          },
      {
        width: '*',
        alignment: 'right',
        fontSize: 8,
        color: TEXTO,
        stack: [
          { text: e.razaoSocial ?? e.nome, bold: true, fontSize: 9, color: ESCURO },
          ...e.endereco.map((linha) => ({ text: linha })),
          {
            text: [e.telefone && `Telefone: ${e.telefone}`, e.documento, e.inscricaoMunicipal && `IM ${e.inscricaoMunicipal}`]
              .filter(Boolean)
              .join(' · '),
          },
          ...(e.email ? [{ text: e.email }] : []),
        ],
      },
    ],
    columnGap: 16,
  };
}

function faixaDestaques(destaques: string[]): Content[] {
  if (!destaques.length) return [];
  return [
    {
      table: {
        widths: destaques.map(() => '*'),
        body: [
          destaques.map((t) => ({
            text: [{ text: '•  ', color: '#63e6be', bold: true }, t],
            color: '#ffffff',
            fontSize: 8,
            alignment: 'center',
          })),
        ],
      },
      layout: caixa(ESCURO, null),
      margin: [0, 12, 0, 0],
    },
  ];
}

function partes(d: DadosDocumento): Content {
  const p = d.pessoa;
  const proposta: Content = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              {
                columns: [
                  { text: TITULOS[d.tipo], bold: true, fontSize: 11, color: ESCURO, width: '*' },
                  { text: `Nº ${d.numero}`, bold: true, fontSize: 15, color: COR, alignment: 'right', width: 'auto' },
                ],
                margin: [0, 0, 0, 6],
              },
              ficha(
                [
                  [ROTULO_NUMERO[d.tipo], String(d.numero)],
                  ['Data', d.emissao],
                  ['Validade', d.validade && `até ${d.validade.ate}`],
                  ['Responsável', d.responsavel],
                ],
                90,
              ),
              ...(d.cancelado ? [{ text: 'CANCELADO', bold: true, color: '#e03131', fontSize: 9, margin: [0, 4, 0, 0] } as Content] : []),
            ],
          },
        ],
      ],
    },
    layout: caixa('#f1f3f5', null),
  };
  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: d.rotuloPessoa === 'Cliente' ? 'Para' : 'Fornecedor', bold: true, fontSize: 11, color: ESCURO },
          { canvas: [{ type: 'line', x1: 0, y1: 3, x2: 270, y2: 3, lineWidth: 0.5, lineColor: LINHA }], margin: [0, 0, 0, 6] },
          ficha(
            [
              ['Nome', p.nome],
              [p.documento?.startsWith('CPF') ? 'CPF' : 'CNPJ', p.documento?.replace(/^(CPF|CNPJ) /, '') ?? null],
              ['E-mail', p.email],
              ['Telefone', p.telefone],
              ['Endereço', p.endereco.length ? p.endereco.join('\n') : null],
            ],
            55,
          ),
        ],
      },
      { width: 225, stack: [proposta] },
    ],
    columnGap: 24,
    margin: [0, 16, 0, 0],
  };
}

const NOME_GRUPO: Record<GrupoItens['tipo'], { coluna: string; titulo: string; subtotal: string }> = {
  PRODUTO: { coluna: 'Produto', titulo: 'Produtos', subtotal: 'Subtotal dos produtos' },
  SERVICO: { coluna: 'Serviço', titulo: 'Serviços', subtotal: 'Subtotal dos serviços' },
};

/** Descrição do item, com a foto do produto à esquerda quando houver. */
function celulaDescricao(i: LinhaItem): TableCell {
  const texto: Content = {
    stack: [
      { text: i.descricao, color: ESCURO },
      { text: `Cód. ${i.codigo}`, fontSize: 7, color: CINZA, margin: [0, 1, 0, 0] },
    ],
  };
  if (!i.imagem) return texto;
  return { columns: [{ image: i.imagem, fit: [40, 40], width: 40 }, { width: '*', ...texto }], columnGap: 8 };
}

function tabelaItens(d: DadosDocumento, grupo: GrupoItens, separado: boolean): Content {
  const th = (text: string, alignment: 'left' | 'right' | 'center' = 'left'): TableCell => ({ text, alignment, color: CINZA, fontSize: 7.5, bold: true });
  const colunas = d.comDesconto ? 6 : 5;
  const cabecalhoItens: TableCell[] = [
    th(NOME_GRUPO[grupo.tipo].coluna),
    th('Qtd', 'center'),
    th('Unitário', 'right'),
    ...(d.comDesconto ? [th('Desconto', 'right')] : []),
    th('Unit. final', 'right'),
    th('Total', 'right'),
  ];
  const linhas: TableCell[][] = grupo.itens.map((i) => [
    celulaDescricao(i),
    { text: `${i.quantidade} ${i.unidade}`, alignment: 'center' },
    { text: i.unitario, alignment: 'right' },
    ...(d.comDesconto ? [{ text: i.desconto || '—', alignment: 'right', color: i.desconto ? '#e03131' : CINZA } as TableCell] : []),
    { text: i.unitarioFinal, alignment: 'right' },
    { text: i.total, alignment: 'right', bold: true, color: ESCURO },
  ]);
  const rodape: TableCell[] = [
    { text: [{ text: `${separado ? NOME_GRUPO[grupo.tipo].subtotal : 'Subtotal'}  `, bold: true }, { text: grupo.contagem, color: CINZA }], colSpan: colunas - 1 },
    ...Array.from({ length: colunas - 2 }, () => ({}) as TableCell),
    { text: grupo.subtotal, alignment: 'right', bold: true, color: ESCURO },
  ];
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: d.comDesconto ? ['*', 50, 62, 56, 62, 70] : ['*', 55, 70, 70, 78],
      body: [cabecalhoItens, ...linhas, rodape],
    },
    layout: { ...grade, fillColor: (linha, node) => (linha === 0 || linha === node.table.body.length - 1 ? FUNDO : null) },
    fontSize: 8.5,
    color: TEXTO,
  };
}

/** Uma tabela por grupo; com produtos e serviços juntos, cada um ganha seu título. */
function secaoItens(d: DadosDocumento): Content[] {
  if (d.grupos.length === 1) return [titulo(d.tipo === 'ORCAMENTO' ? 'Itens da proposta' : 'Itens'), tabelaItens(d, d.grupos[0], false)];
  return d.grupos.flatMap((g) => [titulo(NOME_GRUPO[g.tipo].titulo), tabelaItens(d, g, true)]);
}

function resumo(d: DadosDocumento): Content[] {
  const linha = (rotulo: string, valor: string, cor = TEXTO): Content => ({
    columns: [
      { text: rotulo, color: CINZA },
      { text: valor, alignment: 'right', color: cor },
    ],
    margin: [0, 2, 0, 2],
  });
  const destaqueTotal: ContentTable = {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: d.cartao ? 'Total à vista' : 'Total', fontSize: 8, color: '#ffffff', alignment: 'center' },
              { text: d.total, fontSize: 17, bold: true, color: '#ffffff', alignment: 'center' },
            ],
          },
        ],
      ],
    },
    layout: caixa(COR, null),
  };
  const totais: Content = d.cartao
    ? {
        columns: [
          {
            width: '*',
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      { text: 'No cartão, em até', fontSize: 8, color: CINZA, alignment: 'center' },
                      { text: d.cartao.resumo, fontSize: 15, bold: true, color: ESCURO, alignment: 'center' },
                    ],
                  },
                ],
              ],
            },
            layout: caixa('#ffffff', LINHA),
          },
          { width: '*', ...destaqueTotal },
        ],
        columnGap: 10,
        margin: [0, 8, 0, 0],
      }
    : { ...destaqueTotal, margin: [0, 8, 0, 0] };
  return [
    titulo(d.tipo === 'ORCAMENTO' ? 'Resumo da proposta' : 'Resumo'),
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: d.contagem, fontSize: 8, color: CINZA, margin: [0, 0, 0, 4] },
                // Separados, os subtotais já vêm com desconto (como nas tabelas), e a soma deles é o total.
                ...(d.grupos.length > 1
                  ? [
                      ...d.grupos.map((g) => linha(`${NOME_GRUPO[g.tipo].titulo} (${g.contagem})`, g.subtotal)),
                      ...(d.descontos ? [{ text: `Já com ${d.descontos} de desconto`, fontSize: 7.5, color: '#e03131', alignment: 'right', margin: [0, 0, 0, 2] } as Content] : []),
                    ]
                  : [linha('Valor dos itens', d.bruto), ...(d.descontos ? [linha('Descontos', `- ${d.descontos}`, '#e03131')] : [])]),
                { canvas: [{ type: 'line', x1: 0, y1: 3, x2: LARGURA - 20, y2: 3, lineWidth: 0.5, lineColor: LINHA }], margin: [0, 2, 0, 4] },
                { columns: [{ text: 'Valor total', bold: true, color: ESCURO }, { text: d.total, alignment: 'right', bold: true, color: ESCURO }] },
                totais,
              ],
            },
          ],
        ],
      },
      layout: caixa(null, LINHA),
      fontSize: 9,
      unbreakable: true,
    },
  ];
}

function tabelaCartao(cartao: NonNullable<DadosDocumento['cartao']>): Content[] {
  return [
    titulo('Formas de pagamento'),
    {
      table: {
        headerRows: 1,
        widths: ['*', 120, 120],
        body: [
          [
            { text: 'Condição', color: CINZA, fontSize: 7.5, bold: true },
            { text: 'Valor da parcela', color: CINZA, fontSize: 7.5, bold: true, alignment: 'right' },
            { text: 'Total', color: CINZA, fontSize: 7.5, bold: true, alignment: 'right' },
          ],
          ...cartao.linhas.map((l): TableCell[] => [
            { text: [l.condicao, ...(l.observacao ? [{ text: `   ${l.observacao}`, fontSize: 7, color: CINZA }] : [])] },
            { text: l.parcela, alignment: 'right' },
            { text: l.total, alignment: 'right', bold: true, color: ESCURO },
          ]),
        ],
      },
      layout: { ...grade, paddingTop: () => 4, paddingBottom: () => 4, fillColor: (linha) => (linha === 0 ? FUNDO : null) },
      fontSize: 8.5,
      color: TEXTO,
    },
  ];
}

function parcelasCombinadas(d: DadosDocumento): Content[] {
  if (typeof d.pagamento === 'string') {
    // No orçamento com tabela de cartão, a condição à vista já está nela.
    return d.cartao ? [] : [titulo('Condições de pagamento'), { text: d.pagamento, fontSize: 9, color: TEXTO }];
  }
  return [
    titulo(d.cartao ? 'Parcelamento combinado' : 'Condições de pagamento'),
    {
      table: {
        headerRows: 1,
        widths: [70, 100, 100],
        body: [
          [
            { text: 'Parcela', color: CINZA, fontSize: 7.5, bold: true },
            { text: 'Vencimento', color: CINZA, fontSize: 7.5, bold: true },
            { text: 'Valor', color: CINZA, fontSize: 7.5, bold: true, alignment: 'right' },
          ],
          ...d.pagamento.map((p): TableCell[] => [p.parcela, p.vencimento, { text: p.valor, alignment: 'right', bold: true, color: ESCURO }]),
        ],
      },
      layout: { ...grade, paddingTop: () => 4, paddingBottom: () => 4, fillColor: (linha) => (linha === 0 ? FUNDO : null) },
      fontSize: 8.5,
      color: TEXTO,
    },
  ];
}

function condicoes(d: DadosDocumento): Content[] {
  const blocos: Content[] = [];
  // Quadros curtos não se dividem entre páginas, e o título vai junto.
  const secao = (nome: string, conteudo: Content): Content => ({ stack: [titulo(nome), conteudo], unbreakable: true });
  if (d.observacoes) {
    blocos.push(d.observacoes.length > 600 ? { stack: [titulo('Observações'), { text: d.observacoes, fontSize: 9, color: TEXTO }] } : secao('Observações', { text: d.observacoes, fontSize: 9, color: TEXTO }));
  }
  if (d.condicoes || d.garantia) {
    blocos.push(secao('Condições comerciais', {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                ...(d.condicoes ? [{ text: d.condicoes, fontSize: 9, color: TEXTO }] : []),
                ...(d.garantia ? [{ text: `Garantia: ${d.garantia}`, fontSize: 8, color: CINZA, margin: [0, d.condicoes ? 6 : 0, 0, 0] } as Content] : []),
              ],
            },
          ],
        ],
      },
      layout: caixa('#f1f3f5', null),
    }));
  }
  const cartoes: { rotulo: string; valor: string; detalhe: string | null; fundo: string; cor: string }[] = [
    { rotulo: 'FORMA DE PAGAMENTO', valor: d.formaPagamento, detalhe: null, fundo: '#e7f5ff', cor: '#1971c2' },
    ...(d.escopoServico ? [{ rotulo: 'ESCOPO DO SERVIÇO', valor: d.escopoServico.valor, detalhe: d.escopoServico.detalhe, fundo: '#f3f0ff', cor: '#6741d9' }] : []),
    ...(d.prazoEntrega ? [{ rotulo: 'PREVISÃO DE ENTREGA', valor: d.prazoEntrega, detalhe: null, fundo: '#ebfbee', cor: '#2f9e44' }] : []),
    ...(d.validade
      ? [
          {
            rotulo: 'VALIDADE DA PROPOSTA',
            valor: `Válida até ${d.validade.ate}`,
            detalhe: `${d.validade.dias} ${d.validade.dias === 1 ? 'dia' : 'dias'} a partir da emissão`,
            fundo: '#fff9db',
            cor: '#e67700',
          },
        ]
      : []),
  ];
  blocos.push(
    secao('Condições gerais', {
    columns: cartoes.map((c) => ({
      width: '*',
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: c.rotulo, fontSize: 7.5, bold: true, color: c.cor, characterSpacing: 0.3 },
                { text: c.valor, fontSize: 9, bold: true, color: ESCURO, margin: [0, 3, 0, 0] },
                ...(c.detalhe ? [{ text: c.detalhe, fontSize: 7.5, color: CINZA, margin: [0, 2, 0, 0] } as Content] : []),
              ],
            },
          ],
        ],
      },
      layout: caixa(c.fundo, null),
    })),
    columnGap: 8,
    }),
  );
  return blocos;
}

function assinatura(d: DadosDocumento): Content[] {
  if (d.tipo !== 'PEDIDO' && d.tipo !== 'PEDIDO_COMPRA') return [];
  return [
    {
      columns: [
        { width: '*', text: '' },
        {
          width: 220,
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 }] },
            { text: `De acordo: ${d.pessoa.nome}`, fontSize: 8, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        },
      ],
      margin: [0, 48, 0, 0],
      unbreakable: true,
    },
  ];
}

export function montarDocumento(d: DadosDocumento): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 46],
    info: { title: `${TITULOS[d.tipo]} nº ${d.numero} - ${d.empresa.nome}`, author: d.empresa.nome, creator: 'Relda ERP' },
    defaultStyle: { font: 'Helvetica', fontSize: 9, lineHeight: 1.15 },
    // Título que cairia no fim da página, só com a linha abaixo dele, vai para a página seguinte.
    pageBreakBefore: (no, consultas) => no.headlineLevel === 1 && consultas.getFollowingNodesOnPage().length <= 1,
    watermark: d.cancelado ? { text: 'CANCELADO', color: '#e03131', opacity: 0.15, bold: true } : undefined,
    footer: (pagina, total) => ({
      columns: [
        { text: `${d.empresa.nome} · gerado em ${d.geradoEm} pelo Relda ERP`, fontSize: 7, color: CINZA },
        { text: `Página ${pagina} de ${total}`, fontSize: 7, color: CINZA, alignment: 'right' },
      ],
      margin: [36, 20, 36, 0],
    }),
    content: [
      cabecalho(d),
      ...faixaDestaques(d.destaques),
      partes(d),
      ...secaoItens(d),
      ...resumo(d),
      ...(d.cartao ? tabelaCartao(d.cartao) : []),
      ...parcelasCombinadas(d),
      ...condicoes(d),
      ...assinatura(d),
    ],
  };
}

const HELVETICA = { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' };
let fontesProntas = false;

/** Gera o PDF com a Helvetica embutida (sem arquivos de fonte) e sem acesso a URLs ou arquivos externos. */
export function gerarPdf(documento: TDocumentDefinitions): Promise<Buffer> {
  if (!fontesProntas) {
    pdfmake.setFonts({ Helvetica: HELVETICA });
    pdfmake.setUrlAccessPolicy(() => false);
    // As fontes padrão do PDF passam pela mesma checagem de arquivo local; só elas são liberadas.
    const fontes = new Set(Object.values(HELVETICA));
    pdfmake.setLocalAccessPolicy((caminho) => fontes.has(caminho));
    fontesProntas = true;
  }
  return pdfmake.createPdf(documento).getBuffer();
}

/** Gera o documento; se o logo ou uma foto não puder ser lida (imagem corrompida), gera sem imagens em vez de falhar. */
export async function gerarDocumento(d: DadosDocumento) {
  try {
    return await gerarPdf(montarDocumento(d));
  } catch (erro) {
    if (!d.empresa.logo && !d.grupos.some((g) => g.itens.some((i) => i.imagem))) throw erro;
    return gerarPdf(
      montarDocumento({
        ...d,
        empresa: { ...d.empresa, logo: null },
        grupos: d.grupos.map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, imagem: null })) })),
      }),
    );
  }
}
