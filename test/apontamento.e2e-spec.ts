import { INestApplication } from '@nestjs/common';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, limparBanco, registrarEmpresa } from './helpers';

const PADRAO = ['Levantamento', 'Orçamento aprovado', 'Compra de material', 'Infraestrutura', 'Fiação e quadros', 'Testes e entrega'];

interface Etapa {
  id: string;
  nome: string;
  ordem: number;
  dataLimite: string | null;
  concluidaEm: string | null;
}
interface Obra {
  id: string;
  nome: string;
  situacao: string | null;
  observacao: string | null;
  etapas: Etapa[];
}

describe('Apontamento de obras', () => {
  let app: INestApplication;
  let a: Acesso;
  let centroId: string;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
    centroId = (await api(app, a.token).post('/centros-custo', { nome: 'Obra Helio Mitsuo' }).expect(201)).body.id;
  });
  afterAll(() => app.close());

  describe('etapas padrão (cadastro)', () => {
    it('empresa nova já começa com as 6 etapas padrão, em ordem e ativas', async () => {
      const { body } = await api(app, a.token).get('/etapas-padrao').expect(200);
      expect(body.map((e: Etapa) => e.nome)).toEqual(PADRAO);
      expect(body.map((e: Etapa) => e.ordem)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(body.every((e: { ativo: boolean }) => e.ativo)).toBe(true);
    });

    it('inclui no fim, renomeia, desativa e exclui', async () => {
      const { body: nova } = await api(app, a.token).post('/etapas-padrao', { nome: 'Vistoria final' }).expect(201);
      expect(nova).toMatchObject({ nome: 'Vistoria final', ordem: 7, ativo: true });

      await api(app, a.token).patch(`/etapas-padrao/${nova.id}`, { nome: 'Vistoria com o cliente', ativo: false }).expect(200);
      const { body: lista } = await api(app, a.token).get('/etapas-padrao').expect(200);
      expect(lista.at(-1)).toMatchObject({ nome: 'Vistoria com o cliente', ativo: false });

      await api(app, a.token).delete(`/etapas-padrao/${nova.id}`).expect(204);
      expect((await api(app, a.token).get('/etapas-padrao').expect(200)).body).toHaveLength(6);
    });

    it('recusa nome repetido', async () => {
      await api(app, a.token).post('/etapas-padrao', { nome: 'Levantamento' }).expect(409);
    });

    it('reordena pela lista completa de ids e recusa lista incompleta', async () => {
      const { body } = await api(app, a.token).get('/etapas-padrao').expect(200);
      const ids = body.map((e: Etapa) => e.id).reverse();
      const { body: nova } = await api(app, a.token).put('/etapas-padrao/ordem', { ids }).expect(200);
      expect(nova.map((e: Etapa) => e.nome)).toEqual([...PADRAO].reverse());
      await api(app, a.token).put('/etapas-padrao/ordem', { ids: ids.slice(1) }).expect(400);
    });

    it('perfil financeiro altera; perfil de consulta só lê', async () => {
      const financeiro = await adicionarUsuario(app, a, Perfil.FINANCEIRO);
      const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
      await api(app, financeiro.token).post('/etapas-padrao', { nome: 'Projeto' }).expect(201);
      await api(app, consulta.token).get('/etapas-padrao').expect(200);
      await api(app, consulta.token).post('/etapas-padrao', { nome: 'Outra' }).expect(403);
    });
  });

  describe('etapas da obra', () => {
    const obra = async () => (await api(app, a.token).get(`/apontamento/${centroId}`).expect(200)).body as Obra;

    it('aplica as etapas padrão ativas, na ordem, uma vez só', async () => {
      const { body: padrao } = await api(app, a.token).get('/etapas-padrao').expect(200);
      await api(app, a.token).patch(`/etapas-padrao/${padrao[0].id}`, { ativo: false }).expect(200);

      const { body } = await api(app, a.token).post(`/apontamento/${centroId}/etapas/padrao`).expect(201);
      expect(body.etapas.map((e: Etapa) => e.nome)).toEqual(PADRAO.slice(1));
      expect(body.etapas.every((e: Etapa) => e.dataLimite === null && e.concluidaEm === null)).toBe(true);

      await api(app, a.token).post(`/apontamento/${centroId}/etapas/padrao`).expect(400);
    });

    it('inclui, define data limite, conclui, reabre, reordena e exclui etapas', async () => {
      await api(app, a.token).post(`/apontamento/${centroId}/etapas`, { nome: 'Levantamento' }).expect(201);
      const { body } = await api(app, a.token).post(`/apontamento/${centroId}/etapas`, { nome: 'Fiação', dataLimite: '2099-01-10' }).expect(201);
      const [primeira, segunda] = body.etapas as Etapa[];
      expect(body.etapas.map((e: Etapa) => [e.nome, e.ordem, e.dataLimite])).toEqual([
        ['Levantamento', 1, null],
        ['Fiação', 2, '2099-01-10'],
      ]);

      let atual = (await api(app, a.token).patch(`/apontamento/${centroId}/etapas/${primeira.id}`, { concluida: true, dataLimite: '2099-01-05' }).expect(200)).body as Obra;
      expect(atual.etapas[0].concluidaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(atual.etapas[0].dataLimite).toBe('2099-01-05');

      atual = (await api(app, a.token).patch(`/apontamento/${centroId}/etapas/${primeira.id}`, { concluida: false, dataLimite: null }).expect(200)).body;
      expect(atual.etapas[0]).toMatchObject({ concluidaEm: null, dataLimite: null });

      atual = (await api(app, a.token).put(`/apontamento/${centroId}/etapas/ordem`, { ids: [segunda.id, primeira.id] }).expect(200)).body;
      expect(atual.etapas.map((e) => [e.nome, e.ordem])).toEqual([
        ['Fiação', 1],
        ['Levantamento', 2],
      ]);

      atual = (await api(app, a.token).delete(`/apontamento/${centroId}/etapas/${segunda.id}`).expect(200)).body;
      expect(atual.etapas.map((e) => e.nome)).toEqual(['Levantamento']);
      expect((await obra()).etapas).toHaveLength(1);
    });

    it('recusa data limite inválida', async () => {
      await api(app, a.token).post(`/apontamento/${centroId}/etapas`, { nome: 'X', dataLimite: '10/01/2099' }).expect(400);
    });

    it('registra a situação e a observação da obra, e limpa a observação com null', async () => {
      const { body } = await api(app, a.token)
        .patch(`/apontamento/${centroId}`, { situacao: 'AGUARDANDO_MATERIAL', observacao: 'Disjuntores chegam na quinta' })
        .expect(200);
      expect(body).toMatchObject({ situacao: 'AGUARDANDO_MATERIAL', observacao: 'Disjuntores chegam na quinta' });
      expect((await api(app, a.token).patch(`/apontamento/${centroId}`, { observacao: null }).expect(200)).body.observacao).toBeNull();
      await api(app, a.token).patch(`/apontamento/${centroId}`, { situacao: 'INVENTADA' }).expect(400);
      await api(app, a.token).patch(`/apontamento/${centroId}`, { observacao: 'x'.repeat(501) }).expect(400);
    });

    it('excluir o centro de custo leva as etapas junto', async () => {
      await api(app, a.token).post(`/apontamento/${centroId}/etapas/padrao`).expect(201);
      await api(app, a.token).delete(`/centros-custo/${centroId}`).expect(204);
      await api(app, a.token).get(`/apontamento/${centroId}`).expect(404);
    });
  });

  describe('painel', () => {
    it('lista só os centros ativos, com etapas em ordem, situação, observação e os dias de alerta da empresa', async () => {
      await api(app, a.token).post(`/apontamento/${centroId}/etapas/padrao`).expect(201);
      await api(app, a.token).patch(`/apontamento/${centroId}`, { situacao: 'EM_EXECUCAO', observacao: 'Equipe do Marcos' }).expect(200);
      await api(app, a.token).post('/centros-custo', { nome: 'Administrativo', ativo: false }).expect(201);
      await api(app, a.token).post('/centros-custo', { nome: 'Troca dos cabos' }).expect(201);

      const { body } = await api(app, a.token).get('/apontamento').expect(200);
      expect(body.diasAlerta).toBe(3);
      expect(body.obras.map((o: Obra) => o.nome)).toEqual(['Obra Helio Mitsuo', 'Troca dos cabos']);
      const helio = body.obras[0] as Obra;
      expect(helio).toMatchObject({ situacao: 'EM_EXECUCAO', observacao: 'Equipe do Marcos' });
      expect(helio.etapas.map((e) => e.ordem)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(body.obras[1]).toMatchObject({ situacao: null, etapas: [] });
    });

    it('os dias de alerta vêm da configuração da empresa (0 a 60)', async () => {
      await api(app, a.token).patch('/empresas/atual', { diasAlertaEtapa: 5 }).expect(200);
      expect((await api(app, a.token).get('/apontamento').expect(200)).body.diasAlerta).toBe(5);
      await api(app, a.token).patch('/empresas/atual', { diasAlertaEtapa: 61 }).expect(400);
    });

    it('consulta lê o painel mas não altera; vendas também só lê', async () => {
      const consulta = await adicionarUsuario(app, a, Perfil.CONSULTA);
      const vendas = await adicionarUsuario(app, a, Perfil.VENDAS);
      await api(app, consulta.token).get('/apontamento').expect(200);
      await api(app, consulta.token).patch(`/apontamento/${centroId}`, { situacao: 'PAUSADO' }).expect(403);
      await api(app, vendas.token).post(`/apontamento/${centroId}/etapas`, { nome: 'X' }).expect(403);
    });

    it('outra empresa não vê nem altera as obras', async () => {
      const b = await registrarEmpresa(app);
      expect((await api(app, b.token).get('/apontamento').expect(200)).body.obras).toEqual([]);
      await api(app, b.token).get(`/apontamento/${centroId}`).expect(404);
      await api(app, b.token).patch(`/apontamento/${centroId}`, { situacao: 'PAUSADO' }).expect(404);
      await api(app, b.token).post(`/apontamento/${centroId}/etapas`, { nome: 'Invasão' }).expect(404);
      const { body: padraoB } = await api(app, b.token).get('/etapas-padrao').expect(200);
      await api(app, a.token).patch(`/etapas-padrao/${padraoB[0].id}`, { nome: 'Invasão' }).expect(404);
    });

    it('etapa de outra obra não é alterada pela rota desta', async () => {
      const outra = (await api(app, a.token).post('/centros-custo', { nome: 'Outra obra' }).expect(201)).body.id;
      const { body } = await api(app, a.token).post(`/apontamento/${outra}/etapas`, { nome: 'Dela' }).expect(201);
      await api(app, a.token).patch(`/apontamento/${centroId}/etapas/${body.etapas[0].id}`, { concluida: true }).expect(404);
      await api(app, a.token).delete(`/apontamento/${centroId}/etapas/${body.etapas[0].id}`).expect(404);
    });
  });
});
