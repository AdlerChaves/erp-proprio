import { describe, expect, it } from 'vitest';
import { data, documento, lerDataBR, mesAno, moeda, proximoCodigo, qtd, totalItemCentavos, documentoValido } from './formato';

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

describe('proximoCodigo', () => {
  const plano = ['1', '1.01', '1.02', '2', '2.01', '2.01.01', '2.01.02', '2.02'];
  it.each([
    ['1', '1.03'],
    ['2.01', '2.01.03'],
    ['2.02', '2.02.01'],
    [null, '3'],
  ])('abaixo de %s sugere %s', (pai, esperado) => {
    expect(proximoCodigo(pai, plano)).toBe(esperado);
  });

  it('não confunde 1.1 com filhos de 1.10', () => {
    expect(proximoCodigo('1', ['1', '1.1', '1.10', '1.10.01'])).toBe('1.11');
  });
});

describe('itens', () => {
  it('formata quantidades com até 3 casas', () => {
    expect([qtd(1.5), qtd(1000), qtd(0.125), qtd(-2)]).toEqual(['1,5', '1.000', '0,125', '-2']);
  });

  it('calcula o total do item como a API, em centavos', () => {
    expect(totalItemCentavos(1.5, 18.9)).toBe(2835);
    expect(totalItemCentavos(2, 80, 10.5)).toBe(14950);
    expect(totalItemCentavos(0.333, 0.1)).toBe(3);
  });
});

describe('documentoValido', () => {
  it.each([
    ['11.222.333/0001-81', true],
    ['11222333000182', false],
    ['529.982.247-25', true],
    ['52998224724', false],
    ['00000000000000', false],
    ['123', false],
  ])('%s → %s', (doc, esperado) => {
    expect(documentoValido(doc)).toBe(esperado);
  });
});
