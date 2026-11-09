/**
 * Cliente HTTP da API. A sessão fica num cookie httpOnly que o navegador envia sozinho;
 * aqui só guardamos em memória o token CSRF, repetido no cabeçalho de toda escrita.
 */

let csrfToken: string | undefined;
let aoExpirar: () => void = () => {};

export const definirCsrf = (token: string | undefined) => {
  csrfToken = token;
};

/** Chamado quando a API responde 401 fora do login: a sessão expirou ou foi encerrada. */
export const aoSessaoExpirar = (callback: () => void) => {
  aoExpirar = callback;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly corpo?: unknown,
  ) {
    super(message);
  }
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD']);

/** Junta as mensagens de validação da API (que podem vir em lista) numa frase. */
function mensagemDeErro(status: number, corpo: unknown) {
  const mensagem = (corpo as { message?: unknown } | null)?.message;
  if (Array.isArray(mensagem)) return mensagem.join('; ');
  if (typeof mensagem === 'string') return mensagem;
  if (status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  return `Erro inesperado (${status})`;
}

export async function requisitar<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Sessao': 'cookie' };
  // FormData (upload) vai sem Content-Type: o navegador o monta com o "boundary" do multipart.
  const multipart = corpo instanceof FormData;
  if (corpo !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (!METODOS_SEGUROS.has(metodo) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const resposta = await fetch(`/api${rota}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : multipart ? corpo : JSON.stringify(corpo),
    credentials: 'same-origin',
  });
  if (resposta.status === 204) return undefined as T;

  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    if (resposta.status === 401 && !rota.startsWith('/auth/login')) aoExpirar();
    throw new ApiError(resposta.status, mensagemDeErro(resposta.status, dados), dados);
  }
  return dados as T;
}

/** Envia um arquivo no campo "arquivo" (multipart), como a API de anexos espera. */
export function enviarArquivo<T>(rota: string, arquivo: File) {
  const formulario = new FormData();
  formulario.append('arquivo', arquivo);
  return requisitar<T>('POST', rota, formulario);
}

/** Nome sugerido pelo servidor: o filename* (UTF-8, com acentos) tem prioridade sobre o filename comum. */
export function nomeDoDownload(contentDisposition: string | null, nomePadrao: string) {
  const utf8 = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // Codificação inválida: segue para o filename comum.
    }
  }
  return contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? nomePadrao;
}

async function buscarArquivo(rota: string, nomePadrao: string) {
  const resposta = await fetch(`/api${rota}`, { headers: { 'X-Sessao': 'cookie' }, credentials: 'same-origin' });
  if (!resposta.ok) {
    const dados: unknown = await resposta.json().catch(() => null);
    if (resposta.status === 401) aoExpirar();
    throw new ApiError(resposta.status, mensagemDeErro(resposta.status, dados), dados);
  }
  return { nome: nomeDoDownload(resposta.headers.get('Content-Disposition'), nomePadrao), blob: await resposta.blob() };
}

/** Baixa um arquivo da API (ex.: XML da DPS) com o nome sugerido pelo servidor. */
export async function baixarArquivo(rota: string, nomePadrao: string) {
  const { nome, blob } = await buscarArquivo(rota, nomePadrao);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Abre um PDF ou imagem da API numa aba nova. A aba é aberta antes do download para o navegador
 * não tratá-la como pop-up; se o download falhar, ela é fechada.
 */
export async function abrirArquivo(rota: string) {
  const aba = window.open('', '_blank');
  try {
    const { blob } = await buscarArquivo(rota, 'arquivo');
    const url = URL.createObjectURL(blob);
    if (aba) {
      aba.opener = null;
      aba.location.href = url;
    }
    else window.location.assign(url);
    // Dá tempo de a aba carregar antes de liberar a memória.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (erro) {
    aba?.close();
    throw erro;
  }
}

export const api = {
  get: <T>(rota: string) => requisitar<T>('GET', rota),
  post: <T>(rota: string, corpo: unknown = {}) => requisitar<T>('POST', rota, corpo),
  patch: <T>(rota: string, corpo: unknown) => requisitar<T>('PATCH', rota, corpo),
  put: <T>(rota: string, corpo: unknown) => requisitar<T>('PUT', rota, corpo),
  delete: <T>(rota: string) => requisitar<T>('DELETE', rota),
};

/** Monta a query string ignorando filtros vazios. */
export function consulta(parametros: Record<string, string | number | null | undefined>) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== '') busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : '';
}
