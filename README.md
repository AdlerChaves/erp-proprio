# ERP Próprio — API

API em NestJS + PostgreSQL (TypeORM) com autenticação JWT, multiempresa e os módulos **Clientes** e **Contas a Receber**.

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
| `ADMIN` | Tudo, incluindo usuários, dados da empresa e remoção de clientes |
| `FINANCEIRO` | Clientes (criar e alterar) e contas a receber |
| `VENDAS` | Clientes (criar e alterar) |
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
| GET | `/api/contas-receber?clienteId=&status=&vencimentoDe=&vencimentoAte=` | Lista com filtros |
| POST | `/api/contas-receber` | Cria conta (status `ABERTA`) |
| GET/PATCH | `/api/contas-receber/:id` | Consulta / altera (só se `ABERTA`) |
| POST | `/api/contas-receber/:id/baixa` | Registra pagamento (`PAGA`) |
| POST | `/api/contas-receber/:id/cancelamento` | Cancela (`CANCELADA`) |

O documento do cliente é único dentro da empresa. Um cliente com contas a receber não pode ser removido (FK `RESTRICT`).

## Migrations

O schema é controlado só por migrations (`synchronize: false`).
Depois de alterar uma entidade:

```bash
npm run migration:generate -- src/database/migrations/NomeDaMudanca
npm run migration:run
```
