import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateXML } from 'xmllint-wasm';

/** Versão do leiaute nacional da NFS-e (DPS, NFS-e e pedido de registro de evento). */
export const VERSAO_LEIAUTE = '1.01';

const PASTA_ESQUEMAS = join(__dirname, 'esquemas', VERSAO_LEIAUTE);

/**
 * No XSD oficial, o padrão da série é "^0{0,4}\d{1,5}$". Em expressões de XSD, ^ e $ não são âncoras, e sim
 * caracteres comuns, então um validador estrito (libxml2) recusa qualquer série real. Os arquivos oficiais
 * ficam intactos; a correção é aplicada só na leitura (junto com o BOM que alguns deles trazem).
 */
export const PADRAO_SERIE_OFICIAL = '<xs:pattern value="^0{0,4}\\d{1,5}$"/>';
const corrigirEsquema = (conteudo: string) =>
  conteudo.replace(/^﻿/, '').replace(PADRAO_SERIE_OFICIAL, '<xs:pattern value="0{0,4}\\d{1,5}"/>');

const lidos = new Map<string, { fileName: string; contents: string }>();
const arquivo = (nome: string) => {
  let lido = lidos.get(nome);
  if (!lido) {
    lido = { fileName: nome, contents: corrigirEsquema(readFileSync(join(PASTA_ESQUEMAS, nome), 'utf8')) };
    lidos.set(nome, lido);
  }
  return lido;
};

const BASE = ['tiposComplexos_v1.01.xsd', 'tiposSimples_v1.01.xsd', 'xmldsig-core-schema.xsd'];

/** Os documentos que o ERP valida: o arquivo principal de cada um e os que ele inclui. */
const ESQUEMAS = {
  dps: { principal: 'DPS_v1.01.xsd', dependencias: BASE },
  nfse: { principal: 'NFSe_v1.01.xsd', dependencias: BASE },
  pedidoEvento: { principal: 'pedRegEvento_v1.01.xsd', dependencias: ['tiposEventos_v1.01.xsd', ...BASE] },
};

/** Valida o XML contra o XSD oficial; devolve as mensagens de erro (vazio se estiver válido). */
export async function validarXml(xml: string, esquema: keyof typeof ESQUEMAS) {
  const { principal, dependencias } = ESQUEMAS[esquema];
  const resultado = await validateXML({
    xml: [{ fileName: `${esquema}.xml`, contents: xml }],
    schema: [arquivo(principal)],
    preload: dependencias.map(arquivo),
  });
  return resultado.errors.map((e) => e.message);
}
