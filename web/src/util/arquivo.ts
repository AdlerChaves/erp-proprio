/** Fotos e logos: PNG ou JPEG de até 400 KB, como a API aceita. */
export const TAMANHO_MAXIMO_IMAGEM = 400 * 1024;

export const lerComoDataUrl = (arquivo: File) =>
  new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler o arquivo'));
    leitor.readAsDataURL(arquivo);
  });

/** Conteúdo do arquivo em base64 puro (sem o prefixo "data:"), como a API recebe o certificado digital. */
export const lerComoBase64 = async (arquivo: File) => (await lerComoDataUrl(arquivo)).replace(/^data:[^,]*,/, '');

/** Anexos de contas (boletos, notas fiscais, comprovantes): o mesmo limite e os mesmos tipos que a API aceita. */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;
export const TIPOS_ANEXO = 'application/pdf,image/png,image/jpeg,application/xml,text/xml,.pdf,.png,.jpg,.jpeg,.xml';

const DECIMAL = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function tamanhoArquivo(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${DECIMAL.format(bytes / 1024)} KB`;
  return `${DECIMAL.format(bytes / 1024 / 1024)} MB`;
}

/**
 * Só imagens abrem numa aba. PDF e XML vêm de terceiros (fornecedor, banco) e são baixados:
 * aberto pelo navegador, o PDF rodaria na origem do ERP, com a sessão do usuário.
 */
export const podeVisualizar = (tipo: string) => tipo.startsWith('image/');

/** Confere antes de enviar o que dá para conferir no navegador; o tipo real a API confere pelo conteúdo. */
export function problemaNoAnexo(arquivo: File) {
  if (arquivo.size === 0) return `${arquivo.name} está vazio`;
  if (arquivo.size > TAMANHO_MAXIMO_ANEXO) return `${arquivo.name} tem mais de 10 MB`;
  return null;
}

/** Problemas de todos os arquivos de uma seleção: o envio só começa se a lista vier vazia. */
export const problemasNoLote = (arquivos: File[]) => arquivos.map(problemaNoAnexo).filter((p): p is string => p !== null);
