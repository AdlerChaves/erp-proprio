import { describe, expect, it } from 'vitest';
import { podeVisualizar, problemaNoAnexo, problemasNoLote, tamanhoArquivo, TAMANHO_MAXIMO_ANEXO } from './arquivo';

describe('anexos', () => {
  it('formata o tamanho em B, KB ou MB', () => {
    expect(tamanhoArquivo(900)).toBe('900 B');
    expect(tamanhoArquivo(2048)).toBe('2 KB');
    expect(tamanhoArquivo(1536 * 1024)).toBe('1,5 MB');
  });

  it('só imagens abrem no navegador; PDF e XML vão para download', () => {
    // PDF de terceiros não roda no visualizador do navegador na origem do ERP.
    expect(podeVisualizar('application/pdf')).toBe(false);
    expect(podeVisualizar('image/png')).toBe(true);
    expect(podeVisualizar('image/jpeg')).toBe(true);
    expect(podeVisualizar('application/xml')).toBe(false);
  });

  it('confere o lote inteiro antes de enviar', () => {
    const arquivo = (nome: string, tamanho: number) => ({ size: tamanho, name: nome }) as File;
    expect(problemasNoLote([arquivo('a.pdf', 10), arquivo('b.pdf', 0), arquivo('c.pdf', TAMANHO_MAXIMO_ANEXO + 1)])).toEqual([
      'b.pdf está vazio',
      'c.pdf tem mais de 10 MB',
    ]);
    expect(problemasNoLote([arquivo('a.pdf', 10)])).toEqual([]);
  });

  it('avisa antes do envio quando o arquivo passa de 10 MB ou está vazio', () => {
    const arquivo = (tamanho: number) => ({ size: tamanho, name: 'x.pdf' }) as File;
    expect(problemaNoAnexo(arquivo(TAMANHO_MAXIMO_ANEXO))).toBeNull();
    expect(problemaNoAnexo(arquivo(TAMANHO_MAXIMO_ANEXO + 1))).toBe('x.pdf tem mais de 10 MB');
    expect(problemaNoAnexo(arquivo(0))).toBe('x.pdf está vazio');
  });
});
