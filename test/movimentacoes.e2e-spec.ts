import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import {
  Acesso,
  adicionarUsuario,
  api,
  criarApp,
  criarCliente,
  criarConta,
  criarFornecedor,
  limparBanco,
  registrarEmpresa,
} from './helpers';

const hoje = () => new Date().toISOString().slice(0, 10);

describe('Movimentações bancárias', () => {
  let app: INestApplication;
  let a: Acesso;
  /** Conta corrente de A com saldo inicial de 1.000,00 em 2026-01-01. */
  let banco: string;
  let caixa: string;
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
          nome: 'Banco',
          tipo: 'CORRENTE',
          banco: '341',
          agencia: '1',
          numero: '1',
          saldoInicial: 1000,
          dataSaldoInicial: '2026-01-01',
        })
        .expect(201)
    ).body.id;
    caixa = (
      await api(app, a.token)
        .post('/contas-bancarias', { nome: 'Caixa', tipo: 'CAIXA', saldoInicial: 0, dataSaldoInicial: '2026-01-01' })
        .expect(201)
    ).body.id;
    const { body } = await api(app, a.token).get('/plano-contas').expect(200);
    plano = Object.fromEntries(body.map((c: { codigo: string; id: string }) => [c.codigo, c.id]));
  });
  afterAll(() => app.close());

  const saldoDe = async (contaId: string, data?: string) => {
    const { body } = await api(app, a.token).get(`/movimentacoes/saldos${data ? `?data=${data}` : ''}`).expect(200);
    return body.contas.find((c: { contaBancaria: { id: string } }) => c.contaBancaria.id === contaId).saldo as number;
  };

  const contaPaga = async (tipo: 'receber' | 'pagar', valorPago: number, dataPagamento = hoje()) => {
    const conta =
      tipo === 'receber'
        ? await criarConta(app, a.token, (await criarCliente(app, a.token)).id)
        : (
            await api(app, a.token)
              .post('/contas-pagar', {
                fornecedorId: (await criarFornecedor(app, a.token)).id,
                descricao: 'Aluguel',
                valor: valorPago,
                dataVencimento: '2099-01-01',
              })
              .expect(201)
          ).body;
    await api(app, a.token)
      .post(`/contas-${tipo}/${conta.id}/baixa`, { contaBancariaId: banco, valorPago, dataPagamento })
      .expect(201);
    return conta.id as string;
  };

  describe('baixas', () => {
    it('recebimento gera entrada e pagamento gera saída na conta bancária', async () => {
      const receberId = await contaPaga('receber', 150.5);
      const pagarId = await contaPaga('pagar', 400);

      const { body } = await api(app, a.token).get(`/movimentacoes?contaBancariaId=${banco}`).expect(200);
      expect(body).toEqual([
        expect.objectContaining({ tipo: 'ENTRADA', valor: 150.5, origem: 'CONTA_RECEBER', contaReceberId: receberId, descricao: 'Recebimento: Venda' }),
        expect.objectContaining({ tipo: 'SAIDA', valor: 400, origem: 'CONTA_PAGAR', contaPagarId: pagarId, descricao: 'Pagamento: Aluguel' }),
      ]);
      expect(await saldoDe(banco)).toBe(750.5);
    });

    it('não aceita pagamento com data anterior ao saldo inicial da conta', async () => {
      const conta = await criarConta(app, a.token, (await criarCliente(app, a.token)).id);
      await api(app, a.token)
        .post(`/contas-receber/${conta.id}/baixa`, { contaBancariaId: banco, dataPagamento: '2025-12-31' })
        .expect(400);
      const atual = await api(app, a.token).get(`/contas-receber/${conta.id}`).expect(200);
      expect(atual.body.status).toBe('ABERTA');
      await api(app, a.token).get('/movimentacoes').expect(200, []);
    });

    it('a movimentação de uma baixa não pode ser removida diretamente', async () => {
      await contaPaga('receber', 100);
      const [mov] = (await api(app, a.token).get('/movimentacoes').expect(200)).body;
      const res = await api(app, a.token).delete(`/movimentacoes/${mov.id}`).expect(400);
      expect(res.body.message).toMatch(/estorne/i);
    });
  });

  describe('estorno de baixa', () => {
    it.each(['receber', 'pagar'] as const)('conta a %s volta a aberta e a movimentação some', async (tipo) => {
      const id = await contaPaga(tipo, 200);
      const rota = `/contas-${tipo}/${id}`;

      const res = await api(app, a.token).post(`${rota}/estorno`).expect(201);
      expect(res.body).toMatchObject({ status: 'ABERTA', valorPago: null, dataPagamento: null, contaBancariaId: null });
      await api(app, a.token).get('/movimentacoes').expect(200, []);
      expect(await saldoDe(banco)).toBe(1000);

      await api(app, a.token).post(`${rota}/baixa`, { contaBancariaId: caixa }).expect(201);
      expect(await saldoDe(caixa)).toBe(tipo === 'receber' ? 150.5 : -200);
    });

    it('só estorna conta paga', async () => {
      const conta = await criarConta(app, a.token, (await criarCliente(app, a.token)).id);
      await api(app, a.token).post(`/contas-receber/${conta.id}/estorno`).expect(400);
      await api(app, a.token).post(`/contas-receber/${conta.id}/cancelamento`).expect(201);
      await api(app, a.token).post(`/contas-receber/${conta.id}/estorno`).expect(400);
    });
  });

  describe('movimentação avulsa', () => {
    it('lança tarifa e rendimento com categoria, e remove', async () => {
      const tarifa = await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 12.9, descricao: 'Tarifa', planoContaId: plano['2.06.01'] })
        .expect(201);
      await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'ENTRADA', valor: 3.1, descricao: 'Rendimento', planoContaId: plano['1.03'] })
        .expect(201);
      expect(tarifa.body).toMatchObject({ origem: 'AVULSA', data: hoje(), planoContaId: plano['2.06.01'] });
      expect(await saldoDe(banco)).toBe(990.2);

      await api(app, a.token).delete(`/movimentacoes/${tarifa.body.id}`).expect(204);
      expect(await saldoDe(banco)).toBe(1003.1);
    });

    it('exige categoria do tipo certo: receita na entrada, despesa na saída', async () => {
      const base = { contaBancariaId: banco, valor: 10, descricao: 'X' };
      await api(app, a.token).post('/movimentacoes', { ...base, tipo: 'ENTRADA', planoContaId: plano['2.06.01'] }).expect(400);
      await api(app, a.token).post('/movimentacoes', { ...base, tipo: 'SAIDA', planoContaId: plano['1.03'] }).expect(400);
    });

    it('recusa valor zero ou negativo, conta inativa e data anterior ao saldo inicial', async () => {
      const base = { contaBancariaId: banco, tipo: 'SAIDA', descricao: 'X' };
      await api(app, a.token).post('/movimentacoes', { ...base, valor: 0 }).expect(400);
      await api(app, a.token).post('/movimentacoes', { ...base, valor: -5 }).expect(400);
      await api(app, a.token).post('/movimentacoes', { ...base, valor: 5, data: '2025-12-31' }).expect(400);
      await api(app, a.token).patch(`/contas-bancarias/${banco}`, { ativo: false }).expect(200);
      await api(app, a.token).post('/movimentacoes', { ...base, valor: 5 }).expect(400);
    });
  });

  describe('transferência', () => {
    it('gera saída e entrada ligadas, sem mudar o total', async () => {
      const res = await api(app, a.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: caixa, valor: 300 })
        .expect(201);
      const [saida, entrada] = res.body;
      expect(saida).toMatchObject({ contaBancariaId: banco, tipo: 'SAIDA', valor: 300, origem: 'TRANSFERENCIA' });
      expect(entrada).toMatchObject({ contaBancariaId: caixa, tipo: 'ENTRADA', valor: 300, origem: 'TRANSFERENCIA' });
      expect(entrada.transferenciaId).toBe(saida.transferenciaId);

      const saldos = (await api(app, a.token).get('/movimentacoes/saldos').expect(200)).body;
      expect(await saldoDe(banco)).toBe(700);
      expect(await saldoDe(caixa)).toBe(300);
      expect(saldos.total).toBe(1000);
    });

    it('remover uma perna remove as duas', async () => {
      const res = await api(app, a.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: caixa, valor: 300 })
        .expect(201);
      await api(app, a.token).delete(`/movimentacoes/${res.body[1].id}`).expect(204);
      await api(app, a.token).get('/movimentacoes').expect(200, []);
      expect(await saldoDe(banco)).toBe(1000);
    });

    it('recusa mesma conta na origem e no destino, e conta inativa', async () => {
      await api(app, a.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: banco, valor: 10 })
        .expect(400);
      await api(app, a.token).patch(`/contas-bancarias/${caixa}`, { ativo: false }).expect(200);
      await api(app, a.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: caixa, valor: 10 })
        .expect(400);
      await api(app, a.token).get('/movimentacoes').expect(200, []);
    });
  });

  describe('saldo e extrato', () => {
    it('o saldo considera só as movimentações até a data pedida', async () => {
      await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 100, descricao: 'Março', data: '2026-03-10' })
        .expect(201);
      await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'ENTRADA', valor: 50, descricao: 'Futuro', data: '2099-01-01' })
        .expect(201);

      expect(await saldoDe(banco, '2026-03-09')).toBe(1000);
      expect(await saldoDe(banco, '2026-03-10')).toBe(900);
      expect(await saldoDe(banco)).toBe(900);
      expect(await saldoDe(banco, '2099-01-01')).toBe(950);
      expect(await saldoDe(banco, '2025-12-31')).toBe(0);
    });

    it('soma valores sem erro de ponto flutuante', async () => {
      for (const valor of [0.1, 0.2, 0.3, 0.1, 0.2]) {
        await api(app, a.token).post('/movimentacoes', { contaBancariaId: caixa, tipo: 'ENTRADA', valor, descricao: 'Centavos' }).expect(201);
      }
      expect(await saldoDe(caixa)).toBe(0.9);
    });

    it('o extrato traz saldo anterior, saldo após cada linha e saldo final do período', async () => {
      const lancar = (tipo: string, valor: number, data: string) =>
        api(app, a.token).post('/movimentacoes', { contaBancariaId: banco, tipo, valor, descricao: `${tipo} ${data}`, data }).expect(201);
      await lancar('SAIDA', 100, '2026-01-15');
      await lancar('ENTRADA', 250, '2026-02-05');
      await lancar('SAIDA', 30.25, '2026-02-20');
      await lancar('ENTRADA', 10, '2026-03-01');

      const { body } = await api(app, a.token)
        .get(`/movimentacoes/extrato?contaBancariaId=${banco}&de=2026-02-01&ate=2026-02-28`)
        .expect(200);
      expect(body).toMatchObject({ de: '2026-02-01', ate: '2026-02-28', saldoAnterior: 900, saldoFinal: 1119.75 });
      expect(body.movimentacoes.map((m: { valor: number; saldo: number }) => [m.valor, m.saldo])).toEqual([
        [250, 1150],
        [30.25, 1119.75],
      ]);

      const completo = await api(app, a.token).get(`/movimentacoes/extrato?contaBancariaId=${banco}`).expect(200);
      expect(completo.body).toMatchObject({ de: '2026-01-01', ate: hoje(), saldoAnterior: 1000, saldoFinal: 1129.75 });
      expect(completo.body.movimentacoes).toHaveLength(4);
    });

    it('a data do saldo inicial não pode passar de uma movimentação existente', async () => {
      await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 1, descricao: 'X', data: '2026-02-01' })
        .expect(201);
      await api(app, a.token).patch(`/contas-bancarias/${banco}`, { dataSaldoInicial: '2026-02-02' }).expect(400);
      await api(app, a.token).patch(`/contas-bancarias/${banco}`, { dataSaldoInicial: '2026-02-01' }).expect(200);
      await api(app, a.token).patch(`/contas-bancarias/${banco}`, { dataSaldoInicial: '2025-06-01' }).expect(200);
    });

    it('a conta bancária com movimentações não pode ser removida', async () => {
      await api(app, a.token).post('/movimentacoes', { contaBancariaId: caixa, tipo: 'ENTRADA', valor: 1, descricao: 'X' }).expect(201);
      await api(app, a.token).delete(`/contas-bancarias/${caixa}`).expect(409);
    });
  });

  describe('isolamento entre empresas', () => {
    it('outra empresa não vê, não movimenta nem remove', async () => {
      const b = await registrarEmpresa(app);
      const caixaB = (
        await api(app, b.token).post('/contas-bancarias', { nome: 'Caixa B', tipo: 'CAIXA', saldoInicial: 0 }).expect(201)
      ).body.id;
      const mov = await api(app, a.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 5, descricao: 'X' })
        .expect(201);

      await api(app, b.token).get('/movimentacoes').expect(200, []);
      const saldosB = (await api(app, b.token).get('/movimentacoes/saldos').expect(200)).body;
      expect(saldosB.contas.map((c: { contaBancaria: { id: string } }) => c.contaBancaria.id)).toEqual([caixaB]);
      await api(app, b.token).get(`/movimentacoes/extrato?contaBancariaId=${banco}`).expect(404);
      await api(app, b.token).delete(`/movimentacoes/${mov.body.id}`).expect(404);
      await api(app, b.token).post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 5, descricao: 'X' }).expect(404);
      await api(app, b.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: caixaB, valor: 5 })
        .expect(404);
      expect(await saldoDe(banco)).toBe(995);
    });
  });

  describe('permissões', () => {
    it.each([
      [Perfil.VENDAS, 403, 403],
      [Perfil.CONSULTA, 200, 403],
      [Perfil.FINANCEIRO, 200, 201],
    ])('perfil %s: consulta saldos %i, lança %i', async (perfil, leitura, escrita) => {
      const usuario = await adicionarUsuario(app, a, perfil);
      await api(app, usuario.token).get('/movimentacoes').expect(leitura);
      await api(app, usuario.token).get('/movimentacoes/saldos').expect(leitura);
      await api(app, usuario.token).get(`/movimentacoes/extrato?contaBancariaId=${banco}`).expect(leitura);
      await api(app, usuario.token)
        .post('/movimentacoes', { contaBancariaId: banco, tipo: 'SAIDA', valor: 1, descricao: 'X' })
        .expect(escrita);
      await api(app, usuario.token)
        .post('/movimentacoes/transferencias', { contaOrigemId: banco, contaDestinoId: caixa, valor: 1 })
        .expect(escrita);
    });

    it('estorno exige ADMIN ou FINANCEIRO', async () => {
      const id = await contaPaga('receber', 10);
      const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
      await api(app, consulta.token).post(`/contas-receber/${id}/estorno`).expect(403);
    });
  });
});
