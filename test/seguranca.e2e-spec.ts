import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import {
  MAXIMO_TENTATIVAS_LOGIN,
  MENSAGEM_LOGIN_RECUSADO,
} from '../src/modules/auth/auth.service';
import { validarSegredoJwt } from '../src/modules/auth/segredo';
import { Perfil } from '../src/modules/usuarios/perfil.enum';
import { Acesso, adicionarUsuario, api, criarApp, criarCliente, limparBanco, registrarEmpresa, SENHA } from './helpers';

/** Cria um app com variáveis de ambiente trocadas só durante a inicialização e as requisições do teste. */
async function comAmbiente<T>(ambiente: Record<string, string>, teste: (app: INestApplication) => Promise<T>) {
  const anterior = Object.fromEntries(Object.keys(ambiente).map((k) => [k, process.env[k]]));
  Object.assign(process.env, ambiente);
  const app = await criarApp();
  try {
    return await teste(app);
  } finally {
    await app.close();
    for (const [k, v] of Object.entries(anterior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('Segurança', () => {
  let app: INestApplication;
  let a: Acesso;

  beforeAll(async () => {
    app = await criarApp();
  });
  beforeEach(async () => {
    await limparBanco(app);
    a = await registrarEmpresa(app);
  });
  afterAll(() => app.close());

  const login = (senha: string, email = a.email) => api(app).post('/auth/login', { email, senha });
  const auditoria = (acao: string) =>
    app.get(DataSource).query(`SELECT * FROM auditoria WHERE acao = $1 ORDER BY criado_em`, [acao]);

  describe('bloqueio por senhas erradas', () => {
    it(`bloqueia a conta após ${MAXIMO_TENTATIVAS_LOGIN} erros seguidos, inclusive para a senha certa`, async () => {
      for (let i = 0; i < MAXIMO_TENTATIVAS_LOGIN; i++) await login('errada123').expect(401);

      const res = await login(SENHA).expect(401);
      expect(res.body.message).toBe(MENSAGEM_LOGIN_RECUSADO);
      const [bloqueio] = await auditoria('CONTA_BLOQUEADA');
      expect(bloqueio).toMatchObject({ usuario_id: a.usuarioId, dados: { tentativas: MAXIMO_TENTATIVAS_LOGIN } });
      expect(await auditoria('LOGIN_RECUSADO_BLOQUEIO')).toHaveLength(1);
    });

    it('libera quando o bloqueio expira', async () => {
      for (let i = 0; i < MAXIMO_TENTATIVAS_LOGIN; i++) await login('errada123').expect(401);
      await app.get(DataSource).query(`UPDATE usuarios SET bloqueado_ate = now() - interval '1 second' WHERE id = $1`, [
        a.usuarioId,
      ]);
      await login(SENHA).expect(200);
    });

    it('um login certo zera a contagem de erros', async () => {
      for (let i = 0; i < MAXIMO_TENTATIVAS_LOGIN - 1; i++) await login('errada123').expect(401);
      await login(SENHA).expect(200);
      for (let i = 0; i < MAXIMO_TENTATIVAS_LOGIN - 1; i++) await login('errada123').expect(401);
      await login(SENHA).expect(200);
    });

    it('erros simultâneos são todos contados', async () => {
      await Promise.all(Array.from({ length: MAXIMO_TENTATIVAS_LOGIN }, () => login('errada123').expect(401)));
      await login(SENHA).expect(401);
    });

    it('e-mail inexistente recebe a mesma resposta e não bloqueia ninguém', async () => {
      for (let i = 0; i < MAXIMO_TENTATIVAS_LOGIN + 1; i++) {
        const res = await login('errada123', 'ninguem@teste.com').expect(401);
        expect(res.body.message).toBe(MENSAGEM_LOGIN_RECUSADO);
      }
      await login(SENHA).expect(200);
    });
  });

  describe('revogação de tokens', () => {
    it('trocar a senha derruba os tokens antigos e o novo token funciona', async () => {
      const outroDispositivo = (await login(SENHA).expect(200)).body.accessToken;
      const res = await api(app, a.token).patch('/auth/senha', { senhaAtual: SENHA, novaSenha: 'outra-senha-boa' }).expect(200);

      for (const antigo of [a.token, outroDispositivo]) {
        const recusa = await api(app, antigo).get('/clientes').expect(401);
        expect(recusa.body.message).toMatch(/Sessão encerrada/);
      }
      await api(app, res.body.accessToken).get('/clientes').expect(200);
    });

    it('encerrar sessões derruba todos os tokens, inclusive o atual', async () => {
      const outroDispositivo = (await login(SENHA).expect(200)).body.accessToken;
      await api(app, a.token).post('/auth/sessoes/encerrar').expect(204);
      await api(app, a.token).get('/clientes').expect(401);
      await api(app, outroDispositivo).get('/clientes').expect(401);
      const novo = (await login(SENHA).expect(200)).body.accessToken;
      await api(app, novo).get('/clientes').expect(200);
    });

    it('token sem versão, mesmo assinado com o segredo certo, é recusado', async () => {
      const semVersao = app.get(JwtService).sign({ sub: a.usuarioId, empresaId: a.empresaId });
      await api(app, semVersao).get('/clientes').expect(401);
    });
  });

  describe('senhas fracas', () => {
    it.each(['12345678', 'Password1', 'senha123', 'aaaaaaaa', 'curta1'])('recusa "%s"', async (senha) => {
      await api(app)
        .post('/auth/registrar', {
          empresa: { razaoSocial: 'Empresa', cnpj: '99999999000199' },
          usuario: { nome: 'Fulano', email: 'fulano@teste.com', senha },
        })
        .expect(400);
      await api(app, a.token).patch('/auth/senha', { senhaAtual: SENHA, novaSenha: senha }).expect(400);
    });
  });

  describe('auditoria', () => {
    it('registra escritas com usuário, recurso, id e corpo sem senhas', async () => {
      const cliente = await criarCliente(app, a.token);
      await api(app, a.token).patch(`/clientes/${cliente.id}`, { nome: 'Novo nome' }).expect(200);
      await api(app, a.token)
        .post('/usuarios', { email: 'novo@teste.com', nome: 'Novo', senha: 'senha-do-novo', perfil: 'VENDAS' })
        .expect(201);

      const { body } = await api(app, a.token).get('/auditoria').expect(200);
      const acoes = body.itens.map((r: { acao: string }) => r.acao);
      expect(acoes).toEqual(['POST /api/usuarios', 'PATCH /api/clientes/:id', 'POST /api/clientes', 'REGISTRO']);

      const [usuarioNovo, alteracao, criacao] = body.itens;
      expect(alteracao).toMatchObject({
        usuarioId: a.usuarioId,
        empresaId: a.empresaId,
        recurso: 'clientes',
        recursoId: cliente.id,
        dados: { nome: 'Novo nome' },
      });
      expect(criacao.recursoId).toBe(cliente.id);
      expect(usuarioNovo.dados).toMatchObject({ email: 'novo@teste.com', senha: '***' });
      expect(JSON.stringify(body)).not.toContain('senha-do-novo');
    });

    it('não registra escritas recusadas', async () => {
      await api(app, a.token).post('/clientes', { nome: 'X', documento: '1' }).expect(400);
      const { body } = await api(app, a.token).get('/auditoria?recurso=clientes').expect(200);
      expect(body.total).toBe(0);
    });

    it('registra o login com empresa e IP', async () => {
      await login(SENHA).expect(200);
      const { body } = await api(app, a.token).get('/auditoria').expect(200);
      expect(body.itens[0]).toMatchObject({ acao: 'LOGIN', usuarioId: a.usuarioId, empresaId: a.empresaId, ip: expect.any(String) });
    });

    it('filtra, pagina e só mostra a própria empresa', async () => {
      for (let i = 0; i < 3; i++) await criarCliente(app, a.token);
      const pagina = await api(app, a.token).get('/auditoria?recurso=clientes&limite=2').expect(200);
      expect(pagina.body).toMatchObject({ total: 3, limite: 2, deslocamento: 0 });
      expect(pagina.body.itens).toHaveLength(2);
      const resto = await api(app, a.token).get('/auditoria?recurso=clientes&limite=2&deslocamento=2').expect(200);
      expect(resto.body.itens).toHaveLength(1);

      const b = await registrarEmpresa(app);
      const daB = await api(app, b.token).get('/auditoria').expect(200);
      expect(daB.body.itens.map((r: { acao: string }) => r.acao)).toEqual(['REGISTRO']);
    });

    it('só ADMIN consulta', async () => {
      const financeiro = await adicionarUsuario(app, a, Perfil.FINANCEIRO);
      await api(app, financeiro.token).get('/auditoria').expect(403);
    });
  });

  describe('cabeçalhos HTTP', () => {
    it('envia os cabeçalhos de segurança e esconde o servidor', async () => {
      const res = await api(app).get('/health').expect(200);
      expect(res.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'strict-transport-security': expect.stringContaining('max-age='),
        'referrer-policy': 'no-referrer',
      });
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('sem CORS_ORIGENS, não autoriza nenhuma origem', async () => {
      const res = await api(app).get('/health').set('Origin', 'https://site-qualquer.com').expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('com CORS_ORIGENS, autoriza só as origens listadas', async () => {
      await comAmbiente({ CORS_ORIGENS: 'https://app.minhaempresa.com, https://admin.minhaempresa.com' }, async (comCors) => {
        const liberada = await api(comCors).get('/health').set('Origin', 'https://admin.minhaempresa.com').expect(200);
        expect(liberada.headers['access-control-allow-origin']).toBe('https://admin.minhaempresa.com');
        const outra = await api(comCors).get('/health').set('Origin', 'https://site-qualquer.com').expect(200);
        expect(outra.headers['access-control-allow-origin']).toBeUndefined();
      });
    });
  });

  describe('limite de requisições por IP', () => {
    it('login e cadastro aceitam poucas tentativas por minuto', async () => {
      await comAmbiente({ THROTTLE_LOGIN_LIMITE: '3' }, async (limitado) => {
        for (let i = 0; i < 3; i++) await api(limitado).post('/auth/login', { email: a.email, senha: 'errada123' }).expect(401);
        await api(limitado).post('/auth/login', { email: a.email, senha: SENHA }).expect(429);
        await api(limitado).post('/auth/registrar', {}).expect(400);
      });
    });

    it('o limite geral vale antes da autenticação, inclusive para tokens inválidos', async () => {
      await comAmbiente({ THROTTLE_LIMITE: '5' }, async (limitado) => {
        for (let i = 0; i < 5; i++) await api(limitado, 'token-falso').get('/clientes').expect(401);
        await api(limitado, 'token-falso').get('/clientes').expect(429);
      });
    });
  });

  describe('segredo do JWT', () => {
    it.each([
      ['curto', 'curto-demais'],
      ['de exemplo', 'troque-por-um-segredo-longo-e-aleatorio'],
    ])('a aplicação não sobe com segredo %s', (_, segredo) => {
      expect(() => validarSegredoJwt(segredo)).toThrow(/JWT_SECRET/);
    });

    it('aceita um segredo longo e aleatório', () => {
      expect(validarSegredoJwt('a'.repeat(32))).toHaveLength(32);
    });
  });
});
