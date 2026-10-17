# ERP Próprio — API

API em NestJS + PostgreSQL (TypeORM) com autenticação JWT, multiempresa, cadastros básicos (clientes, fornecedores, produtos e serviços, plano de contas, centros de custo e contas bancárias) e **Contas a Receber**.

## Rodando com Docker

```bash
cp .env.example .env   # e troque o JWT_SECRET (openssl rand -hex 32)
docker compose up --build
```

A API sobe em `http://localhost:3000/api`, com o Swagger em `http://localhost:3000/docs`.
As migrations rodam automaticamente na subida do container.

## Rodando localmente

```bash
npm install
docker compose up -d db
npm run migration:run
npm run start:dev
```

## Autenticação e multiempresa

- `POST /api/auth/registrar` cria a empresa e o usuário administrador e devolve o token.
- Todas as rotas, exceto `registrar`, `login` e `health`, exigem `Authorization: Bearer <token>`.
- O token identifica **usuário + empresa**. Todos os dados (clientes, contas) são filtrados pela empresa do token; o `empresaId` nunca vem do corpo da requisição.
- Um usuário pode ter acesso a várias empresas, com um perfil em cada. No login, quem tem mais de uma empresa precisa informar `empresaId`; depois pode trocar com `POST /api/auth/trocar-empresa`.
- O perfil e o bloqueio de acesso são conferidos no banco a cada requisição, então valem na hora, sem novo login.

| Perfil | Pode |
|---|---|
| `ADMIN` | Tudo, incluindo usuários, dados da empresa e remoção de qualquer cadastro |
| `FINANCEIRO` | Criar e alterar todos os cadastros e contas a receber |
| `VENDAS` | Criar e alterar clientes e produtos |
| `CONSULTA` | Só leitura |

A empresa sempre mantém pelo menos um `ADMIN` ativo.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Verifica API e banco (público) |
| POST | `/api/auth/registrar` | Cria empresa + admin (público) |
| POST | `/api/auth/login` | Login com `email`, `senha` e `empresaId` opcional (público) |
| POST | `/api/auth/trocar-empresa` | Novo token para outra empresa do usuário |
| GET | `/api/auth/me` | Usuário logado, perfil e empresas acessíveis |
| PATCH | `/api/auth/senha` | Altera a própria senha |
| GET/PATCH | `/api/empresas/atual` | Consulta / altera a empresa atual (alterar: `ADMIN`) |
| POST | `/api/empresas` | Cria outra empresa com o usuário logado como `ADMIN` |
| GET/POST | `/api/usuarios` | Lista / dá acesso a usuários da empresa (`ADMIN`) |
| PATCH | `/api/usuarios/:id` | Altera perfil ou bloqueia o acesso (`ADMIN`) |
| GET/POST | `/api/clientes` | Lista / cria clientes |
| GET/PATCH/DELETE | `/api/clientes/:id` | Consulta / altera / remove cliente |
| GET/POST | `/api/fornecedores` | Lista / cria fornecedores |
| GET/PATCH/DELETE | `/api/fornecedores/:id` | Consulta / altera / remove fornecedor |
| GET/POST | `/api/produtos?tipo=` | Lista / cria produtos e serviços |
| GET/PATCH/DELETE | `/api/produtos/:id` | Consulta / altera / remove produto ou serviço |
| GET/POST | `/api/plano-contas?tipo=` | Lista (em ordem de código) / cria contas do plano |
| GET/PATCH/DELETE | `/api/plano-contas/:id` | Consulta / altera / remove conta do plano |
| GET/POST | `/api/centros-custo` | Lista / cria centros de custo |
| GET/PATCH/DELETE | `/api/centros-custo/:id` | Consulta / altera / remove centro de custo |
| GET/POST | `/api/contas-bancarias` | Lista / cria contas bancárias e caixas |
| GET/PATCH/DELETE | `/api/contas-bancarias/:id` | Consulta / altera / remove conta bancária |
| GET | `/api/contas-receber?clienteId=&status=&vencimentoDe=&vencimentoAte=` | Lista com filtros |
| POST | `/api/contas-receber` | Cria conta (status `ABERTA`) |
| GET/PATCH | `/api/contas-receber/:id` | Consulta / altera (só se `ABERTA`) |
| POST | `/api/contas-receber/:id/baixa` | Registra pagamento (`PAGA`) |
| POST | `/api/contas-receber/:id/cancelamento` | Cancela (`CANCELADA`) |

Regras dos cadastros:

- Documento (clientes e fornecedores), código (produtos e plano de contas) e nome (centros de custo e contas bancárias) são únicos dentro da empresa.
- Produtos levam NCM; serviços levam o item da LC 116 (`00.00`). Um não aceita o campo do outro.
- Plano de contas em árvore: a subconta tem o mesmo tipo (receita ou despesa) da conta pai e código prefixado por ela (`1` → `1.01`). Só contas sintéticas (`aceitaLancamento: false`) têm subcontas; tipo e conta pai não mudam depois de criados.
- Contas bancárias exigem banco, agência e número, exceto o tipo `CAIXA`.
- Um registro usado por outro (ex.: cliente com contas a receber) não pode ser removido: a API responde 409. Prefira desativar com `ativo: false`.

## Testes

Os testes e2e sobem a aplicação em processo e usam um PostgreSQL real, no mesmo servidor do `.env`, mas sempre no banco `erp_test` (ou em `DB_TEST_NAME`, que precisa terminar com `_test`). Esse banco é apagado, recriado e migrado a cada execução, e as tabelas são esvaziadas antes de cada teste.

```bash
docker compose up -d db
npm run test:e2e
```

| Arquivo | Cobre |
|---|---|
| `test/auth.e2e-spec.ts` | Token, registro, login e troca de senha |
| `test/isolamento.e2e-spec.ts` | Uma empresa não lê nem altera dados de outra |
| `test/perfis.e2e-spec.ts` | Matriz de permissões por perfil, bloqueio e regra do último administrador |
| `test/multiempresa.e2e-spec.ts` | Usuário em várias empresas: login, troca e criação de empresa |
| `test/cadastros.e2e-spec.ts` | CRUD, isolamento e permissões de cada cadastro, e as regras específicas de cada um |

## Migrations

O schema é controlado só por migrations (`synchronize: false`).
Depois de alterar uma entidade:

```bash
npm run migration:generate -- src/database/migrations/NomeDaMudanca
npm run migration:run
```
