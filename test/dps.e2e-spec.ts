import { documentoValido } from '../src/common/documento';
import { dataHoraComFuso } from '../src/common/datas';
import { RegimeTributario } from '../src/modules/empresas/empresa.entity';
import { buscarMunicipios, buscarServicos, municipio, servicoNacional } from '../src/modules/nfse/catalogos';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DadosDps, gerarDps, idDps, PADRAO_SERIE_OFICIAL, validarDps } from '../src/modules/nfse/dps';

/** Prestador ME/EPP do Simples em Várzea Paulista, tomador PJ com endereço. */
const base = (): DadosDps => ({
  ambiente: 2,
  dataHoraEmissao: '2026-10-17T21:05:09-03:00',
  serie: '1',
  numero: 42,
  dataCompetencia: '2026-10-17',
  municipioEmissor: '3556503',
  prestador: {
    cnpj: '11222333000181',
    inscricaoMunicipal: '12345',
    regime: RegimeTributario.SIMPLES_NACIONAL,
    regimeApuracaoSimples: 1,
    aliquotaSimples: 6,
  },
  tomador: {
    documento: '44555666000172',
    nome: 'Mercado Bom Preço Ltda',
    inscricaoMunicipal: null,
    endereco: { cep: '13220000', logradouro: 'Rua Duque de Caxias', numero: '100', bairro: 'Centro', codigoMunicipio: '3556503' },
    telefone: '(11) 4606-0000',
    email: 'compras@bompreco.com.br',
  },
  servico: { codigoTributacaoNacional: '010701', codigoNbs: null, descricao: 'Suporte técnico', municipioPrestacao: '3556503' },
  valores: { servicos: 1500, descontoIncondicionado: 0, issRetido: false, aliquotaIss: null },
});

const campo = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1];

describe('DPS no leiaute nacional 1.01', () => {
  it('Simples ME/EPP sem retenção: válida no XSD oficial, sem alíquota e com o percentual do Simples', async () => {
    const xml = gerarDps(base());
    expect(await validarDps(xml)).toEqual([]);
    expect(xml).toContain('<infDPS Id="DPS355650321122233300018100001000000000000042">');
    expect(campo(xml, 'opSimpNac')).toBe('3');
    expect(campo(xml, 'regApTribSN')).toBe('1');
    expect(campo(xml, 'tpRetISSQN')).toBe('1');
    expect(campo(xml, 'pAliq')).toBeUndefined();
    expect(campo(xml, 'pTotTribSN')).toBe('6.00');
    // O prestador emitente não leva nome nem endereço (E0121, E0128).
    expect(xml.match(/<prest>.*<\/prest>/)![0]).not.toMatch(/xNome|<end>/);
  });

  it('com ISS retido pelo tomador, informa a alíquota', async () => {
    const d = base();
    d.valores = { ...d.valores, issRetido: true, aliquotaIss: 2.5 };
    const xml = gerarDps(d);
    expect(await validarDps(xml)).toEqual([]);
    expect(campo(xml, 'tpRetISSQN')).toBe('2');
    expect(campo(xml, 'pAliq')).toBe('2.50');
  });

  it('MEI: sem regime de apuração, sem alíquota e com o indicador de tributos', async () => {
    const d = base();
    d.prestador = { ...d.prestador, regime: RegimeTributario.MEI, aliquotaSimples: null };
    const xml = gerarDps(d);
    expect(await validarDps(xml)).toEqual([]);
    expect(campo(xml, 'opSimpNac')).toBe('2');
    expect(xml).not.toContain('regApTribSN');
    expect(campo(xml, 'indTotTrib')).toBe('0');
  });

  it('tomador pessoa física, sem endereço, com desconto e NBS', async () => {
    const d = base();
    d.tomador = { documento: '52998224725', nome: 'Ana Souza', inscricaoMunicipal: null, endereco: null, telefone: null, email: null };
    d.servico = { ...d.servico, codigoNbs: '115021000' };
    d.valores = { ...d.valores, descontoIncondicionado: 150.5 };
    const xml = gerarDps(d);
    expect(await validarDps(xml)).toEqual([]);
    expect(campo(xml, 'CPF')).toBe('52998224725');
    expect(campo(xml, 'vDescIncond')).toBe('150.50');
    expect(xml).not.toContain('<end>');
  });

  it('escapa e limpa os textos: acentos ficam, caracteres fora do Latin-1 saem', async () => {
    const d = base();
    d.tomador = { ...d.tomador, nome: '  Café & Cia — “Filial” 😀 ' };
    d.servico = { ...d.servico, descricao: 'Manutenção <mensal>\nItem 2 & 3' };
    const xml = gerarDps(d);
    expect(await validarDps(xml)).toEqual([]);
    expect(campo(xml, 'xNome')).toBe('Café &amp; Cia Filial');
    expect(xml).toContain('<xDescServ>Manutenção &lt;mensal&gt;\nItem 2 &amp; 3</xDescServ>');
  });

  it('o validador acusa uma DPS fora do esquema', async () => {
    const erros = await validarDps(gerarDps(base()).replace('<tpAmb>2</tpAmb>', '<tpAmb>7</tpAmb>'));
    expect(erros.join(' ')).toMatch(/tpAmb/);
  });

  it('recusa empresas fora do Simples, que o ERP ainda não atende', () => {
    const d = base();
    d.prestador = { ...d.prestador, regime: RegimeTributario.LUCRO_PRESUMIDO };
    expect(() => gerarDps(d)).toThrow(/Simples Nacional e MEI/);
  });

  it('o XSD oficial ainda tem o padrão de série que precisa de correção (se mudar, revise dps.ts)', () => {
    const tipos = readFileSync(join(__dirname, '../src/modules/nfse/esquemas/1.01/tiposSimples_v1.01.xsd'), 'utf8');
    expect(tipos).toContain(PADRAO_SERIE_OFICIAL);
  });

  it('monta o identificador com 45 posições', () => {
    const id = idDps({ municipioEmissor: '3556503', cnpj: '11222333000181', serie: '49999', numero: 999999999999999 });
    expect(id).toBe(`DPS3556503211222333000181${'49999'}${'9'.repeat(15)}`);
    expect(id).toHaveLength(45);
  });
});

describe('apoio', () => {
  it('data e hora com o deslocamento do fuso', () => {
    expect(dataHoraComFuso(new Date('2026-10-18T01:05:09Z'))).toBe('2026-10-17T22:05:09-03:00');
  });

  it.each([
    ['11222333000181', true],
    ['11222333000182', false],
    ['52998224725', true],
    ['52998224724', false],
    ['11111111111', false],
  ])('documento %s válido: %s', (doc, valido) => {
    expect(documentoValido(doc)).toBe(valido);
  });

  it('catálogos oficiais de municípios e serviços', () => {
    expect(municipio('3556503')).toEqual({ codigo: '3556503', nome: 'Várzea Paulista', uf: 'SP' });
    expect(buscarMunicipios('varzea paul')).toEqual([expect.objectContaining({ codigo: '3556503' })]);
    expect(servicoNacional('010701')?.descricao).toMatch(/Suporte técnico/);
    expect(buscarServicos('0107').map((s) => s.codigo)).toContain('010701');
  });
});
