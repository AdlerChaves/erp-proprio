import pdfmake from 'pdfmake';
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';

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

export interface ParteDocumento {
  nome: string;
  /** Razão social, quando o nome exibido é o fantasia. */
  razaoSocial?: string | null;
  documento: string;
  /** Linhas de endereço já formatadas ("Rua X, 10 - Centro", "Várzea Paulista - SP - CEP 13220-000"). */
  endereco: string[];
  contato: string | null;
}

export interface DadosDocumento {
  tipo: TipoDocumento;
  numero: number;
  emissao: string;
  cancelado: boolean;
  empresa: ParteDocumento & { inscricaoMunicipal?: string | null };
  /** "Cliente" ou "Fornecedor". */
  rotuloPessoa: string;
  pessoa: ParteDocumento;
  comDesconto: boolean;
  itens: { codigo: string; descricao: string; quantidade: string; unidade: string; unitario: string; desconto: string; total: string }[];
  subtotal: string;
  descontos: string | null;
  total: string;
  /** Uma linha por parcela, ou a condição em texto ("À vista, no faturamento"). */
  pagamento: { parcela: string; vencimento: string; valor: string }[] | string;
  observacoes: string | null;
  geradoEm: string;
}

const COR = '#0ca678';
const CINZA = '#868e96';

const parte = (titulo: string, p: ParteDocumento): Content => ({
  stack: [
    { text: titulo.toUpperCase(), style: 'rotulo' },
    { text: p.nome, bold: true, fontSize: 11 },
    ...(p.razaoSocial ? [{ text: p.razaoSocial, fontSize: 8, color: CINZA }] : []),
    { text: p.documento, fontSize: 9 },
    ...p.endereco.map((linha) => ({ text: linha, fontSize: 9 })),
    ...(p.contato ? [{ text: p.contato, fontSize: 9 }] : []),
  ],
});

export function montarDocumento(d: DadosDocumento): TDocumentDefinitions {
  const cabecalhoItens: TableCell[] = [
    { text: 'Código', style: 'th' },
    { text: 'Descrição', style: 'th' },
    { text: 'Qtd.', style: 'th', alignment: 'right' },
    { text: 'Un.', style: 'th' },
    { text: 'Unitário', style: 'th', alignment: 'right' },
    ...(d.comDesconto ? [{ text: 'Desconto', style: 'th', alignment: 'right' } as TableCell] : []),
    { text: 'Total', style: 'th', alignment: 'right' },
  ];
  const linhasItens: TableCell[][] = d.itens.map((i) => [
    { text: i.codigo, fontSize: 8, color: CINZA },
    i.descricao,
    { text: i.quantidade, alignment: 'right' },
    i.unidade,
    { text: i.unitario, alignment: 'right' },
    ...(d.comDesconto ? [{ text: i.desconto, alignment: 'right' } as TableCell] : []),
    { text: i.total, alignment: 'right' },
  ]);

  const pagamento: Content =
    typeof d.pagamento === 'string'
      ? { text: d.pagamento, fontSize: 9 }
      : {
          table: {
            widths: [60, 80, 80],
            body: [
              [
                { text: 'Parcela', style: 'th' },
                { text: 'Vencimento', style: 'th' },
                { text: 'Valor', style: 'th', alignment: 'right' },
              ],
              ...d.pagamento.map((p) => [p.parcela, p.vencimento, { text: p.valor, alignment: 'right' } as TableCell]),
            ],
          },
          layout: 'lightHorizontalLines',
          fontSize: 9,
        };

  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    info: { title: `${TITULOS[d.tipo]} nº ${d.numero} - ${d.empresa.nome}`, author: d.empresa.nome, creator: 'Relda ERP' },
    defaultStyle: { font: 'Helvetica', fontSize: 10, lineHeight: 1.15 },
    styles: {
      rotulo: { fontSize: 7, bold: true, color: CINZA, characterSpacing: 0.5, margin: [0, 0, 0, 2] },
      th: { bold: true, fontSize: 8, color: '#495057', fillColor: '#f1f3f5' },
    },
    watermark: d.cancelado ? { text: 'CANCELADO', color: '#e03131', opacity: 0.15, bold: true } : undefined,
    footer: (pagina, total) => ({
      columns: [
        { text: `Relda ERP · gerado em ${d.geradoEm}`, fontSize: 7, color: CINZA },
        { text: `Página ${pagina} de ${total}`, fontSize: 7, color: CINZA, alignment: 'right' },
      ],
      margin: [40, 20, 40, 0],
    }),
    content: [
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: d.empresa.nome, fontSize: 15, bold: true, color: COR },
              ...(d.empresa.razaoSocial ? [{ text: d.empresa.razaoSocial, fontSize: 8, color: CINZA }] : []),
              { text: [d.empresa.documento, d.empresa.inscricaoMunicipal && ` · IM ${d.empresa.inscricaoMunicipal}`].filter(Boolean).join(''), fontSize: 8 },
              ...d.empresa.endereco.map((linha) => ({ text: linha, fontSize: 8 })),
              ...(d.empresa.contato ? [{ text: d.empresa.contato, fontSize: 8 }] : []),
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: TITULOS[d.tipo], fontSize: 12, bold: true, alignment: 'right' },
              { text: `Nº ${d.numero}`, fontSize: 20, bold: true, alignment: 'right', color: COR },
              { text: `Emissão: ${d.emissao}`, fontSize: 9, alignment: 'right' },
              ...(d.cancelado ? [{ text: 'CANCELADO', fontSize: 9, bold: true, color: '#e03131', alignment: 'right' } as Content] : []),
            ],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 1, lineColor: COR }], margin: [0, 0, 0, 12] },
      parte(d.rotuloPessoa, d.pessoa),
      { text: 'ITENS', style: 'rotulo', margin: [0, 16, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: d.comDesconto ? [55, '*', 40, 25, 60, 55, 65] : [55, '*', 45, 30, 70, 75],
          body: [cabecalhoItens, ...linhasItens],
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.5 : 0.25),
          vLineWidth: () => 0,
          hLineColor: () => '#ced4da',
          fillColor: (linha) => (linha > 0 && linha % 2 === 0 ? '#f8f9fa' : null),
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        fontSize: 9,
      },
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 200,
            margin: [0, 8, 0, 0],
            table: {
              widths: ['*', 'auto'],
              body: [
                ['Subtotal', { text: d.subtotal, alignment: 'right' }],
                ...(d.descontos ? [['Descontos', { text: `- ${d.descontos}`, alignment: 'right' }] as TableCell[]] : []),
                [
                  { text: 'Total', bold: true, fontSize: 12 },
                  { text: d.total, bold: true, fontSize: 12, alignment: 'right', color: COR },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
      { text: 'CONDIÇÕES DE PAGAMENTO', style: 'rotulo', margin: [0, 16, 0, 4] },
      pagamento,
      ...(d.observacoes
        ? [{ text: 'OBSERVAÇÕES', style: 'rotulo', margin: [0, 16, 0, 4] } as Content, { text: d.observacoes, fontSize: 9 } as Content]
        : []),
      ...(d.tipo === 'PEDIDO' || d.tipo === 'PEDIDO_COMPRA'
        ? [
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
            } as Content,
          ]
        : []),
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
