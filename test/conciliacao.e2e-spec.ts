import { INestApplication } from '@nestjs/common';
import { decodificarOfx, lerOfx } from '../src/modules/conciliacao/ofx';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarCliente, criarFornecedor, limparBanco, registrarEmpresa } from './helpers';

interface Transacao {
  data: string;
  valor: string;
  memo: string;
  fitid?: string | null;
  tipo?: string;
}

/** OFX 1.02 no formato SGML (sem fechamento das tags folha), como Itaú e Bradesco exportam. */
function ofxSgml(transacoes: Transacao[], { saldo = '1000.00', dataSaldo = '20261031', conta = '56789-0' } = {}) {
  const linhas = transacoes
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>${t.tipo ?? (t.valor.startsWith('-') ? 'DEBIT' : 'CREDIT')}
<DTPOSTED>${t.data.replace(/-/g, '')}120000[-3:BRT]
<TRNAMT>${t.valor}
${t.fitid === null ? '' : `<FITID>${t.fitid ?? `${t.data}${t.valor}${t.memo}`.replace(/\W/g, '')}\n`}<MEMO>${t.memo}
</STMTTRN>`,
    )
    .join('\n');
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<BRANCHID>1234<ACCTID>${conta}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001<DTEND>20261031
${linhas}
</BANKTRANLIST>
<LEDGERBAL><BALAMT>${saldo}<DTASOF>${dataSaldo}</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
}

/** O arquivo como o banco grava: Windows-1252. */
const cp1252 = (texto: string) => Buffer.from(texto, 'latin1');

describe('Leitura de OFX', () => {
  it('OFX 1.x em Windows-1252: acentos, sinais, tipos e saldo', () => {
    const texto = decodificarOfx(
      cp1252(
        ofxSgml([
          { data: '2026-10-05', valor: '-12.90', memo: 'TARIFA PACOTE SERVIÇOS' },
          { data: '2026-10-06', valor: '1500.00', memo: 'PIX RECEBIDO JOÃO' },
        ]),
      ),
    );
    const extrato = lerOfx(texto);
    expect(extrato).toMatchObject({ banco: '0341', conta: '56789-0', de: '2026-10-01', ate: '2026-10-31', saldo: { valor: 1000, data: '2026-10-31' } });
    expect(extrato.transacoes.map((t) => [t.data, t.tipo, t.valor, t.descricao])).toEqual([
      ['2026-10-05', 'SAIDA', 12.9, 'TARIFA PACOTE SERVIÇOS'],
      ['2026-10-06', 'ENTRADA', 1500, 'PIX RECEBIDO JOÃO'],
    ]);
  });

  it('OFX 2.x em XML e UTF-8', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>077</BANKID><ACCTID>1234567</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>20261031</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261010</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>a1</FITID><NAME>Assinatura</NAME><MEMO>Café &amp; cia</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const extrato = lerOfx(decodificarOfx(Buffer.from(xml, 'utf8')));
    expect(extrato.transacoes).toEqual([expect.objectContaining({ tipo: 'SAIDA', valor: 89.9, descricao: 'Assinatura - Café & cia', fitid: 'a1' })]);
  });

  it('vírgula decimal, valor sem sinal com tipo de débito e FITID repetido no mesmo dia', () => {
    const extrato = lerOfx(
      ofxSgml([
        { data: '2026-10-07', valor: '1.234,56', memo: 'TED', tipo: 'CREDIT', fitid: '000123' },
        { data: '2026-10-07', valor: '50,00', memo: 'BOLETO', tipo: 'DEBIT', fitid: '000123' },
        { data: '2026-10-07', valor: '50,00', memo: 'BOLETO', tipo: 'DEBIT', fitid: '000123' },
      ]),
    );
    expect(extrato.transacoes.map((t) => [t.tipo, t.valor])).toEqual([
      ['ENTRADA', 1234.56],
      ['SAIDA', 50],
      ['SAIDA', 50],
    ]);
    expect(new Set(extrato.transacoes.map((t) => t.chave)).size).toBe(3);
  });

  it('recusa arquivo que não é OFX e extrato de cartão', () => {
    expect(() => lerOfx('data;valor\n01/10;10')).toThrow(/não é um OFX/);
    expect(() => lerOfx('<OFX><CREDITCARDMSGSRSV1><CCSTMTRS></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>')).toThrow(/cartão de crédito/);
  });
});

describe('Conciliação bancária', () => {
  let app: INestApplication;
  let a: Acesso;
  let banco: string;
  let clienteId: string;
  let fornecedorId: string;
  let plano: Record<string, string>;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    banco = (
      await api(app, a.token)
        .post('/contas-bancarias', {
          nome: 'Itaú',
          tipo: 'CORRENTE',
          banco: '341',
          agencia: '1234',
          numero: '56789-0',
          saldoInicial: 1000,
          dataSaldoInicial: '2026-10-01',
        })
        .expect(201)
    ).body.id;
    clienteId = (await criarCliente(app, a.token)).id;
    fornecedorId = (await criarFornecedor(app, a.token)).id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
  });
  afterAll(() => app.close());

  const importar = (transacoes: Transacao[], opcoes = {}, token = a.token) =>
    api(app, token).post('/conciliacao/importacoes', {
      contaBancariaId: banco,
      nomeArquivo: 'extrato.ofx',
      conteudo: cp1252(ofxSgml(transacoes, opcoes)).toString('base64'),
    });
  const painel = async () =>
    (await api(app, a.token).get(`/conciliacao?contaBancariaId=${banco}&de=2026-10-01&ate=2026-10-31`).expect(200)).body;
  const receber = async (valor: number, vencimento = '2026-10-10') => {
    const conta = (await api(app, a.token).post('/contas-receber', { clienteId, descricao: 'Venda', valor, dataVencimento: vencimento, dataEmissao: '2026-09-01' }).expect(201)).body;
    return conta.id as string;
  };
  const baixarReceber = (id: string, data: string, valor?: number) =>
    api(app, a.token).post(`/contas-receber/${id}/baixas`, { contaBancariaId: banco, data, valor }).expect(201);
  const linha = (p: { linhas: { descricao: string }[] }, texto: string) => p.linhas.find((l) => l.descricao.includes(texto)) as never as {
    id: string;
    status: string;
    sugestoes: { id: string }[];
    contasSugeridas: { id: string; saldo: number }[];
  };

  it('importa só o que é novo e concilia sozinho quando há um único par', async () => {
    const conta = await receber(1500);
    await baixarReceber(conta, '2026-10-06');

    const primeira = await importar([
      { data: '2026-10-05', valor: '-12.90', memo: 'TARIFA' },
      { data: '2026-10-07', valor: '1500.00', memo: 'PIX RECEBIDO' },
    ]).expect(201);
    expect(primeira.body).toMatchObject({ novas: 2, repetidas: 0, conciliadasAutomaticamente: 1, avisos: [] });

    const segunda = await importar([
      { data: '2026-10-05', valor: '-12.90', memo: 'TARIFA' },
      { data: '2026-10-07', valor: '1500.00', memo: 'PIX RECEBIDO' },
      { data: '2026-10-20', valor: '-40.00', memo: 'IOF' },
    ]).expect(201);
    expect(segunda.body).toMatchObject({ novas: 1, repetidas: 2 });

    const p = await painel();
    expect(p.resumo).toEqual({ pendentes: 2, conciliadas: 1, ignoradas: 0 });
    expect(linha(p, 'PIX').status).toBe('CONCILIADA');
  });

  it('com dois pares possíveis, não concilia sozinho e sugere os dois', async () => {
    for (const data of ['2026-10-06', '2026-10-08']) await baixarReceber(await receber(200), data);
    await importar([{ data: '2026-10-07', valor: '200.00', memo: 'PIX' }]).expect(201);
    const l = linha(await painel(), 'PIX');
    expect(l.status).toBe('PENDENTE');
    expect(l.sugestoes).toHaveLength(2);

    await api(app, a.token).post(`/conciliacao/linhas/${l.id}/conciliacao`, { movimentacaoId: l.sugestoes[0].id }).expect(200);
    expect(linha(await painel(), 'PIX').status).toBe('CONCILIADA');
    const p = await painel();
    expect(p.semPar).toHaveLength(1);
  });

  it('não concilia com valor ou sentido diferente, nem a mesma movimentação duas vezes', async () => {
    const conta = await receber(300);
    await baixarReceber(conta, '2026-10-06');
    const mov = (await api(app, a.token).get(`/movimentacoes?contaBancariaId=${banco}`).expect(200)).body[0];
    await importar([
      { data: '2026-10-06', valor: '-300.00', memo: 'SAIDA' },
      { data: '2026-10-06', valor: '299.00', memo: 'QUASE' },
      { data: '2026-10-06', valor: '300.00', memo: 'CERTA' },
      { data: '2026-10-09', valor: '300.00', memo: 'REPETIDA' },
    ]).expect(201);
    const p = await painel();
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'SAIDA').id}/conciliacao`, { movimentacaoId: mov.id }).expect(400);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'QUASE').id}/conciliacao`, { movimentacaoId: mov.id }).expect(400);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'CERTA').id}/conciliacao`, { movimentacaoId: mov.id }).expect(200);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'REPETIDA').id}/conciliacao`, { movimentacaoId: mov.id }).expect(409);
  });

  it('lança tarifa como avulsa com categoria e concilia; desfazer volta a pendente', async () => {
    await importar([{ data: '2026-10-05', valor: '-12.90', memo: 'TARIFA PACOTE' }]).expect(201);
    const l = linha(await painel(), 'TARIFA');
    const { body } = await api(app, a.token)
      .post(`/conciliacao/linhas/${l.id}/avulsa`, { planoContaId: plano['2.06.01'], descricao: 'Tarifa bancária' })
      .expect(201);
    expect(body).toMatchObject({ status: 'CONCILIADA', movimentacao: { tipo: 'SAIDA', valor: 12.9, descricao: 'Tarifa bancária', data: '2026-10-05', planoContaId: plano['2.06.01'] } });

    await api(app, a.token).delete(`/conciliacao/linhas/${l.id}/conciliacao`).expect(200);
    expect(linha(await painel(), 'TARIFA').status).toBe('PENDENTE');
  });

  it('dá baixa numa conta a receber sugerida pelo valor; valor maior vira juros', async () => {
    const certa = await receber(850, '2026-10-12');
    const atrasada = await receber(500, '2026-09-30');
    await importar([
      { data: '2026-10-12', valor: '850.00', memo: 'PIX CLIENTE' },
      { data: '2026-10-15', valor: '512.50', memo: 'BOLETO PAGO COM JUROS' },
    ]).expect(201);
    let p = await painel();
    expect(linha(p, 'PIX CLIENTE').contasSugeridas.map((c) => c.id)).toEqual([certa]);

    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'PIX CLIENTE').id}/baixa`, { contaId: certa }).expect(201);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'JUROS').id}/baixa`, { contaId: atrasada, multa: 10 }).expect(201);

    const conta = (await api(app, a.token).get(`/contas-receber/${atrasada}`).expect(200)).body;
    expect(conta).toMatchObject({ status: 'PAGA', saldo: 0 });
    expect(conta.baixas[0]).toMatchObject({ valor: 500, juros: 2.5, multa: 10, valorTotal: 512.5, data: '2026-10-15' });
    p = await painel();
    expect(p.resumo).toEqual({ pendentes: 0, conciliadas: 2, ignoradas: 0 });
  });

  it('valor menor: pagamento parcial, ou quitação com desconto se pedido', async () => {
    const parcial = await receber(1000);
    const desconto = await receber(1000, '2026-10-11');
    await importar([
      { data: '2026-10-10', valor: '400.00', memo: 'PARCIAL' },
      { data: '2026-10-11', valor: '950.00', memo: 'COM DESCONTO' },
    ]).expect(201);
    const p = await painel();
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'PARCIAL').id}/baixa`, { contaId: parcial }).expect(201);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'DESCONTO').id}/baixa`, { contaId: desconto, quitarComDesconto: true }).expect(201);
    expect((await api(app, a.token).get(`/contas-receber/${parcial}`).expect(200)).body).toMatchObject({ status: 'PARCIAL', saldo: 600 });
    expect((await api(app, a.token).get(`/contas-receber/${desconto}`).expect(200)).body).toMatchObject({ status: 'PAGA', saldo: 0 });
  });

  it('saída do banco dá baixa em conta a pagar; entrada não aceita conta a pagar', async () => {
    const pagar = (
      await api(app, a.token).post('/contas-pagar', { fornecedorId, descricao: 'Aluguel', valor: 2000, dataVencimento: '2026-10-10', dataEmissao: '2026-10-01' }).expect(201)
    ).body.id;
    await importar([
      { data: '2026-10-10', valor: '-2000.00', memo: 'ALUGUEL' },
      { data: '2026-10-10', valor: '2000.00', memo: 'ENTRADA' },
    ]).expect(201);
    const p = await painel();
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'ENTRADA').id}/baixa`, { contaId: pagar }).expect(404);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(p, 'ALUGUEL').id}/baixa`, { contaId: pagar }).expect(201);
    expect((await api(app, a.token).get(`/contas-pagar/${pagar}`).expect(200)).body.status).toBe('PAGA');
  });

  it('estornar a baixa conciliada devolve a linha para pendente', async () => {
    const conta = await receber(700);
    await importar([{ data: '2026-10-10', valor: '700.00', memo: 'PIX' }]).expect(201);
    await api(app, a.token).post(`/conciliacao/linhas/${linha(await painel(), 'PIX').id}/baixa`, { contaId: conta }).expect(201);
    const baixa = (await api(app, a.token).get(`/contas-receber/${conta}`).expect(200)).body.baixas[0];
    await api(app, a.token).delete(`/contas-receber/${conta}/baixas/${baixa.id}`).expect(200);
    expect(linha(await painel(), 'PIX').status).toBe('PENDENTE');
  });

  it('ignorar tira a linha das pendentes', async () => {
    await importar([{ data: '2026-10-10', valor: '-100.00', memo: 'APLICACAO AUTOMATICA' }]).expect(201);
    const l = linha(await painel(), 'APLICACAO');
    await api(app, a.token).post(`/conciliacao/linhas/${l.id}/ignorar`).expect(200);
    await api(app, a.token).post(`/conciliacao/linhas/${l.id}/ignorar`).expect(400);
    expect((await painel()).resumo).toEqual({ pendentes: 0, conciliadas: 0, ignoradas: 1 });
  });

  it('compara o saldo do banco com o do sistema na data do extrato', async () => {
    await importar([{ data: '2026-10-05', valor: '-12.90', memo: 'TARIFA' }], { saldo: '987.10', dataSaldo: '20261031' }).expect(201);
    expect((await painel()).saldos).toEqual({ data: '2026-10-31', banco: 987.1, sistema: 1000, diferenca: -12.9 });
    await api(app, a.token).post(`/conciliacao/linhas/${linha(await painel(), 'TARIFA').id}/avulsa`, {}).expect(201);
    expect((await painel()).saldos.diferenca).toBe(0);
  });

  it('avisa se o arquivo é de outra conta e ignora o que é anterior ao saldo inicial', async () => {
    const { body } = await importar(
      [
        { data: '2026-09-30', valor: '-1.00', memo: 'ANTIGA' },
        { data: '2026-10-02', valor: '-1.00', memo: 'NOVA' },
      ],
      { conta: '99999-9' },
    ).expect(201);
    expect(body.novas).toBe(1);
    expect(body.avisos).toEqual([expect.stringContaining('é da conta 99999-9'), expect.stringContaining('1 transação(ões) anteriores')]);
  });

  it('recusa arquivo inválido; consulta só lê; outra empresa não vê', async () => {
    await api(app, a.token)
      .post('/conciliacao/importacoes', { contaBancariaId: banco, nomeArquivo: 'x.csv', conteudo: Buffer.from('a;b').toString('base64') })
      .expect(400);
    const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
    await api(app, consulta.token).get(`/conciliacao?contaBancariaId=${banco}`).expect(200);
    await importar([{ data: '2026-10-05', valor: '-1.00', memo: 'X' }], {}, consulta.token).expect(403);
    const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
    await api(app, vendas.token).get(`/conciliacao?contaBancariaId=${banco}`).expect(403);
    const b = await registrarEmpresa(app);
    await api(app, b.token).get(`/conciliacao?contaBancariaId=${banco}`).expect(404);
    await importar([{ data: '2026-10-05', valor: '-1.00', memo: 'X' }], {}, b.token).expect(404);
  });

  it('aceita um extrato grande (um ano, ~3 mil transações)', async () => {
    const transacoes = Array.from({ length: 3000 }, (_, i) => ({
      data: `2026-10-${String((i % 28) + 2).padStart(2, '0')}`,
      valor: `-${(i % 97) + 1}.${String(i % 100).padStart(2, '0')}`,
      memo: `COMPRA CARTAO DEBITO ESTABELECIMENTO NUMERO ${i}`,
      fitid: `F${i}`,
    }));
    const inicio = Date.now();
    const { body } = await importar(transacoes).expect(201);
    expect(body.novas).toBe(3000);
    expect(Date.now() - inicio).toBeLessThan(10_000);
  }, 20_000);
});
