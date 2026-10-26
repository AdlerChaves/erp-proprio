/** Fotos e logos: PNG ou JPEG de até 400 KB, como a API aceita. */
export const TAMANHO_MAXIMO_IMAGEM = 400 * 1024;

export const lerComoDataUrl = (arquivo: File) =>
  new Promise<string>((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result));
    leitor.onerror = () => rejeitar(new Error('Não foi possível ler o arquivo'));
    leitor.readAsDataURL(arquivo);
  });
