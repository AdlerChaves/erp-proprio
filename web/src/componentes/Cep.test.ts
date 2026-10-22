import { describe, expect, it } from 'vitest';
import { enderecoDoCep } from './Cep';

const atual = { logradouro: 'Rua Antiga', bairro: 'Bairro Antigo', codigoMunicipio: '3550308' };
const cep = { cep: '13220000', logradouro: 'Rua Duque de Caxias', bairro: 'Centro', codigoMunicipio: '3556503', municipio: null, fonte: 'ViaCEP' };

describe('enderecoDoCep', () => {
  it('o que o CEP traz substitui o que estava', () => {
    expect(enderecoDoCep(cep, atual)).toEqual({ logradouro: 'Rua Duque de Caxias', bairro: 'Centro', codigoMunicipio: '3556503' });
  });

  it('CEP geral de município só troca a cidade; município desconhecido mantém o escolhido', () => {
    expect(enderecoDoCep({ ...cep, logradouro: '', bairro: '' }, atual)).toEqual({ ...atual, codigoMunicipio: '3556503' });
    expect(enderecoDoCep({ ...cep, codigoMunicipio: null }, atual).codigoMunicipio).toBe('3550308');
  });
});
