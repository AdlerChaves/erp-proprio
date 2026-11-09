/** Tipos de arquivo aceitos como anexo, reconhecidos pelo conteúdo, nunca pela extensão. */
export interface TipoArquivo {
  mime: 'application/pdf' | 'image/png' | 'image/jpeg' | 'application/xml';
  extensoes: string[];
}

const PDF: TipoArquivo = { mime: 'application/pdf', extensoes: ['pdf'] };
const PNG: TipoArquivo = { mime: 'image/png', extensoes: ['png'] };
const JPEG: TipoArquivo = { mime: 'image/jpeg', extensoes: ['jpg', 'jpeg'] };
const XML: TipoArquivo = { mime: 'application/xml', extensoes: ['xml'] };

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * XML de nota fiscal: texto UTF-8 válido, sem bytes nulos, começando por uma tag (após BOM e espaços).
 * É só uma checagem de aparência (o XML nunca é interpretado pelo servidor), mas recusa HTML e SVG,
 * que um navegador executaria se um dia fossem abertos como página.
 */
function pareceXml(bytes: Buffer) {
  if (bytes.includes(0)) return false;
  const corpo = bytes.subarray(0, 3).equals(BOM_UTF8) ? bytes.subarray(3) : bytes;
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(corpo).trimStart();
  } catch {
    return false;
  }
  if (!/^<(\?xml\s|[A-Za-z_])/.test(texto) || /<!DOCTYPE\s+html\b/i.test(texto)) return false;
  const semPrologo = texto.replace(/^<\?xml[\s\S]*?\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const raiz = /<([A-Za-z_][\w.:-]*)/.exec(semPrologo)?.[1];
  return !!raiz && !/^(html|svg)$/i.test(raiz.split(':').pop()!);
}

/** Identifica o tipo pela assinatura dos primeiros bytes; `null` se não for PDF, PNG, JPEG ou XML. */
export function detectarTipo(bytes: Buffer): TipoArquivo | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return PDF;
  if (bytes.subarray(0, 8).equals(ASSINATURA_PNG)) return PNG;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return JPEG;
  if (pareceXml(bytes)) return XML;
  return null;
}

/**
 * O multer entrega o nome do arquivo decodificado como latin1. Se os bytes formam UTF-8 válido
 * (caso de qualquer navegador atual), refaz a leitura para recuperar os acentos.
 */
function corrigirCodificacao(nome: string) {
  if (!/[\u0080-\u00ff]/.test(nome)) return nome;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(nome, 'latin1'));
  } catch {
    return nome;
  }
}

const TAMANHO_MAXIMO_NOME = 200;

/**
 * Nome seguro para guardar e devolver: sem diretórios, sem caracteres de controle ou de
 * inversão de texto, sem aspas, até 200 caracteres e terminando na extensão do tipo real.
 */
export function nomeSeguro(original: string, tipo: TipoArquivo) {
  let nome = corrigirCodificacao(original).normalize('NFC');
  nome = nome.split(/[\\/]/).pop() ?? '';
  // Controles, aspas, invers\u00e3o de texto e invis\u00edveis (zero-width, separadores de linha, BOM).
  nome = nome
    .replace(/[\u0000-\u001f\u007f-\u009f"\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const temExtensao = tipo.extensoes.some((e) => nome.toLowerCase().endsWith(`.${e}`));
  const sufixo = temExtensao ? nome.slice(nome.lastIndexOf('.')) : `.${tipo.extensoes[0]}`;
  // Sem pontos no in\u00edcio: nada de arquivo oculto nem "..".
  const base = (temExtensao ? nome.slice(0, nome.lastIndexOf('.')) : nome).replace(/^\.+/, '').trim() || 'arquivo';
  return `${[...base].slice(0, TAMANHO_MAXIMO_NOME - sufixo.length).join('')}${sufixo}`;
}

/** Cabeçalho Content-Disposition de download, com nome ASCII de reserva e o nome original em UTF-8 (RFC 6266). */
export function contentDisposition(nome: string) {
  const ascii = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(nome).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
