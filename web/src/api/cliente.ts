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
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (!METODOS_SEGUROS.has(metodo) && csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const resposta = await fetch(`/api${rota}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
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

export const api = {
  get: <T>(rota: string) => requisitar<T>('GET', rota),
  post: <T>(rota: string, corpo: unknown = {}) => requisitar<T>('POST', rota, corpo),
  patch: <T>(rota: string, corpo: unknown) => requisitar<T>('PATCH', rota, corpo),
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
