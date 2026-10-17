import { describe, expect, it } from 'vitest';
import { data, documento, lerDataBR, mesAno, moeda } from './formato';

describe('formatos', () => {
  it('moeda em reais', () => {
    expect(moeda(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(moeda(-0.1).replace(/\s/g, ' ')).toBe('-R$ 0,10');
  });

  it('data da API para dd/mm/aaaa sem passar pelo fuso', () => {
    expect(data('2026-01-01')).toBe('01/01/2026');
    expect(data('2026-12-31T23:00:00.000Z')).toBe('31/12/2026');
    expect(data(null)).toBe('');
  });

  it('lê datas digitadas no formato brasileiro', () => {
    expect(lerDataBR('10/11/2026')).toBe('2026-11-10');
    expect(lerDataBR(' 1/2/2026 ')).toBe('2026-02-01');
    expect(lerDataBR('29/02/2028')).toBe('2028-02-29');
  });

  it('recusa datas inexistentes ou em outro formato', () => {
    for (const texto of ['31/02/2026', '29/02/2026', '10/13/2026', '2026-11-10', '10/11/26', 'amanhã', '']) {
      expect(lerDataBR(texto)).toBeNull();
    }
  });

  it('mês abreviado', () => {
    expect(mesAno('2026-03')).toBe('mar/2026');
  });

  it('CPF e CNPJ formatados', () => {
    expect(documento('12345678901')).toBe('123.456.789-01');
    expect(documento('11222333000181')).toBe('11.222.333/0001-81');
    expect(documento('123')).toBe('123');
  });
});
