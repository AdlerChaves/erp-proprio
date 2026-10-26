import { describe, expect, it } from 'vitest';
import { parcelaCartao } from './EmpresaProposta';

describe('parcelaCartao', () => {
  it('segue a tabela Price, como o PDF', () => {
    expect(parcelaCartao(7398.92, 12, 2, 1)).toBe(699.64);
    expect(parcelaCartao(7398.92, 2, 2, 1)).toBe(3810.81);
    expect(parcelaCartao(7398.92, 1, 2, 1)).toBe(7398.92);
  });

  it('sem juros até o limite, ou com juros zero', () => {
    expect(parcelaCartao(300, 3, 2, 3)).toBe(100);
    expect(parcelaCartao(300, 4, 0, 1)).toBe(75);
  });
});
