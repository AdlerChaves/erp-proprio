import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Tabelas oficiais da NFS-e nacional, geradas a partir dos anexos (ver esquemas/LEIA-ME.md). */
const ler = <T>(arquivo: string): T => JSON.parse(readFileSync(join(__dirname, 'dados', arquivo), 'utf8'));

export interface Municipio {
  codigo: string;
  nome: string;
  uf: string;
}

export interface ServicoNacional {
  /** Código de tributação nacional (cTribNac): item, subitem e desdobro da LC 116, 6 dígitos. */
  codigo: string;
  descricao: string;
}

const MUNICIPIOS: Municipio[] = ler<[string, string, string][]>('municipios.json').map(([codigo, nome, uf]) => ({ codigo, nome, uf }));
const POR_CODIGO = new Map(MUNICIPIOS.map((m) => [m.codigo, m]));
const SERVICOS: ServicoNacional[] = ler<[string, string][]>('servicos-nacionais.json').map(([codigo, descricao]) => ({ codigo, descricao }));
const SERVICO_POR_CODIGO = new Map(SERVICOS.map((s) => [s.codigo, s]));

/** Sem acento e em minúsculas, para a busca não depender de como o usuário digita. */
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const municipio = (codigo: string) => POR_CODIGO.get(codigo);
export const servicoNacional = (codigo: string) => SERVICO_POR_CODIGO.get(codigo);

export function buscarMunicipios(busca = '', uf?: string, limite = 30) {
  const termo = normalizar(busca.trim());
  return MUNICIPIOS.filter((m) => (!uf || m.uf === uf) && (!termo || normalizar(m.nome).includes(termo) || m.codigo === termo)).slice(0, limite);
}

export function buscarServicos(busca = '', limite = 50) {
  const termo = normalizar(busca.trim());
  const digitos = termo.replace(/\D/g, '');
  return SERVICOS.filter(
    (s) => !termo || normalizar(s.descricao).includes(termo) || (digitos.length > 0 && s.codigo.startsWith(digitos)),
  ).slice(0, limite);
}
