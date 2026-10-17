# ERP Próprio — API

[![CI](https://github.com/AdlerChaves/erp-proprio/actions/workflows/ci.yml/badge.svg)](https://github.com/AdlerChaves/erp-proprio/actions/workflows/ci.yml)

API em NestJS + PostgreSQL (TypeORM) com autenticação JWT, multiempresa, cadastros básicos (clientes, fornecedores, produtos e serviços, plano de contas, centros de custo e contas bancárias), **Contas a Receber** e **Contas a Pagar** com baixas parciais e parcelamento, **movimentação bancária** com saldo e extrato, **fluxo de caixa** e **DRE**.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/`, `test/` | API NestJS e testes e2e |
| `web/` | Frontend React + Vite + Mantine |

## Rodando com Docker

```bash
cp .env.example .env   # e troque o JWT_SECRET (openssl rand -hex 32); a API não sobe com o valor de exemplo
docker compose up --build
```

Abra **http://localhost:8080**. O nginx do serviço `web` serve as telas e repassa `/api` e `/docs` (Swagger) para a API, tudo na mesma origem. A API não fica exposta diretamente, e as migrations rodam na subida do container.

## Desenvolvimento local

```bash
npm install
docker compose up -d db
npm run migration:run
npm run start:dev          # API em http://localhost:3000 (Swagger em /docs)

cd web
npm install
npm run dev                # frontend em http://localhost:5173, com /api repassado para a API
```

## Frontend

React 19, Vite, TypeScript, Mantine (componentes e datas), TanStack Query e React Router.

- Telas: login, cadastro da empresa, escolha e troca de empresa, painel (saldos, fluxo de caixa de 6 meses, contas em atraso), contas a receber e a pagar (filtros, parcelamento, baixas parciais com juros/multa/desconto, estorno, cancelamento), clientes, fornecedores e contas bancárias.
- Os botões aparecem conforme o perfil; quem decide de fato é a API.
- Datas são digitadas e exibidas como dd/mm/aaaa; valores, em reais.
- `npm run typecheck`, `npm test` (Vitest) e `npm run build` dentro de `web/`.

### Sessão no navegador

O frontend envia `X-Sessao: cookie` no login. A API então entrega o token num cookie `httpOnly` (`SameSite=Lax`, `Path=/api`), que nenhum script da página consegue ler, e devolve só um `csrfToken`. Toda escrita autenticada por cookie precisa repetir esse valor no cabeçalho `X-CSRF-Token`; ele também vem em `GET /api/auth/me`. Clientes de API (Swagger, integrações) continuam recebendo o token no corpo e usando `Authorization: Bearer`, sem CSRF. `COOKIE_SECURE` (padrão: ligado em produção) restringe o cookie a HTTPS.

O nginx envia uma Content-Security-Policy restritiva (`web/nginx/seguranca.conf`): scripts só da própria origem, sem frames e sem chamadas a outros domínios.

## Segurança

| Proteção | Como funciona |
|---|---|
| Limite de requisições | Por IP e por minuto: `THROTTLE_LIMITE` (padrão 300) em geral e `THROTTLE_LOGIN_LIMITE` (padrão 10) em login e cadastro. Vale antes da autenticação; acima do limite, a API responde 429. |
| Bloqueio de conta | 5 senhas erradas seguidas bloqueiam a conta por 15 minutos, mesmo para a senha certa. E-mail inexistente, senha errada e conta bloqueada recebem a mesma resposta. |
| Revogação de tokens | Trocar a senha ou chamar `POST /api/auth/sessoes/encerrar` invalida todos os tokens já emitidos. Perfil e bloqueio de acesso também valem na hora. |
| Sessão do navegador | Cookie `httpOnly` com token CSRF obrigatório nas escritas (detalhes em Frontend). |
| Senhas | Entre 8 e 72 caracteres, fora de uma lista de senhas muito comuns; guardadas com scrypt. |
| Auditoria | Toda escrita autenticada bem-sucedida é registrada com usuário, empresa, rota, id e corpo (senhas e tokens viram `***`), além de cadastro, login, falhas e bloqueios. Consulta em `GET /api/auditoria` (só `ADMIN`). |
| Cabeçalhos HTTP | `helmet` (HSTS, `nosniff`, proteção contra frames, sem `X-Powered-By`). |
| CORS | Nenhuma origem é autorizada, a menos que listada em `CORS_ORIGENS`. |
| Segredo do JWT | A API não sobe com `JWT_SECRET` com menos de 32 caracteres ou com o valor de exemplo. |
| Swagger | Desligado quando `NODE_ENV=production`, a menos que `SWAGGER_HABILITADO=true` (o `docker-compose.yml` de desenvolvimento liga). |
| Dependências | O CI falha se `npm audit` encontrar vulnerabilidade moderada ou pior nas dependências de produção. |

Atrás de um proxy reverso, defina `TRUST_PROXY` (ex.: `1`) para que o limite por IP e a auditoria vejam o IP real do cliente.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Verifica API e banco (público) |
| POST | `/api/auth/registrar` | Cria empresa + admin (público) |
| POST | `/api/auth/login` | Login com `email`, `senha` e `empresaId` opcional (público) |
| POST | `/api/auth/trocar-empresa` | Novo token para outra empresa do usuário |
| GET | `/api/auth/me` | Usuário logado, perfil e empresas acessíveis |
| PATCH | `/api/auth/senha` | Altera a própria senha; invalida os tokens anteriores e devolve um novo |
| POST | `/api/auth/sessoes/encerrar` | Sai de todos os dispositivos (invalida todos os tokens do usuário) |
| POST | `/api/auth/logout` | Sai deste navegador (apaga o cookie de sessão) |
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
| GET | `/api/contas-receber?clienteId=&planoContaId=&centroCustoId=&parcelamentoId=&status=&vencimentoDe=&vencimentoAte=` | Lista com filtros, baixas, total baixado e saldo |
| POST | `/api/contas-receber` | Cria conta (status `ABERTA`), com categoria e centro de custo opcionais |
| POST | `/api/contas-receber/parcelamentos` | Divide `valor` em `parcelas` mensais a partir de `dataVencimento` |
| GET/PATCH | `/api/contas-receber/:id` | Consulta / altera (com baixas ou cancelada: só categoria e centro de custo) |
| POST | `/api/contas-receber/:id/baixas` | Registra pagamento total ou parcial, com juros, multa e desconto |
| DELETE | `/api/contas-receber/:id/baixas/:baixaId` | Estorna uma baixa e sua movimentação bancária |
| POST | `/api/contas-receber/:id/cancelamento` | Cancela (`CANCELADA`); só sem baixas |
| GET | `/api/contas-pagar?fornecedorId=&planoContaId=&centroCustoId=&parcelamentoId=&status=&vencimentoDe=&vencimentoAte=` | Lista com filtros, baixas, total baixado e saldo |
| POST | `/api/contas-pagar` | Cria conta (status `ABERTA`), com categoria e centro de custo opcionais |
| POST | `/api/contas-pagar/parcelamentos` | Divide `valor` em `parcelas` mensais a partir de `dataVencimento` |
| GET/PATCH | `/api/contas-pagar/:id` | Consulta / altera (com baixas ou cancelada: só categoria e centro de custo) |
| POST | `/api/contas-pagar/:id/baixas` | Registra pagamento total ou parcial, com juros, multa e desconto |
| DELETE | `/api/contas-pagar/:id/baixas/:baixaId` | Estorna uma baixa e sua movimentação bancária |
| POST | `/api/contas-pagar/:id/cancelamento` | Cancela (`CANCELADA`); só sem baixas |
| GET | `/api/movimentacoes?contaBancariaId=&tipo=&origem=&de=&ate=` | Lista movimentações bancárias |
| POST | `/api/movimentacoes` | Lança movimentação avulsa (tarifa, rendimento, ajuste) |
| POST | `/api/movimentacoes/transferencias` | Transfere entre duas contas da empresa |
| DELETE | `/api/movimentacoes/:id` | Remove avulsa ou as duas pernas de uma transferência |
| GET | `/api/movimentacoes/saldos?data=` | Saldo de cada conta ao fim do dia (padrão: hoje) |
| GET | `/api/movimentacoes/extrato?contaBancariaId=&de=&ate=` | Extrato com saldo anterior, saldo após cada linha e saldo final |
| GET | `/api/auditoria?usuarioId=&recurso=&recursoId=&de=&ate=&limite=&deslocamento=` | Trilha de auditoria da empresa, mais recente primeiro (`ADMIN`) |
| GET | `/api/financeiro/fluxo-caixa?de=&ate=&agrupamento=mes\|dia` | Realizado e previsto por período, saldo acumulado e contas em atraso |
| GET | `/api/financeiro/dre?de=&ate=&regime=competencia\|caixa` | Resultado por categoria, somado até as contas sintéticas |

Regras dos cadastros:

- Documento (clientes e fornecedores), código (produtos e plano de contas) e nome (centros de custo e contas bancárias) são únicos dentro da empresa.
- Produtos levam NCM; serviços levam o item da LC 116 (`00.00`). Um não aceita o campo do outro.
- Plano de contas em árvore: a subconta tem o mesmo tipo (receita ou despesa) da conta pai e código prefixado por ela (`1` → `1.01`). Só contas sintéticas (`aceitaLancamento: false`) têm subcontas; tipo e conta pai não mudam depois de criados.
- Contas bancárias exigem banco, agência e número, exceto o tipo `CAIXA`.
- Toda empresa nova recebe um plano de contas padrão (raiz `1` Receitas e `2` Despesas, com cerca de 30 contas), que pode ser editado e ampliado.

Contas a receber e contas a pagar (mesmas regras; a pagar usa fornecedor e categoria de despesa):

- A categoria (`planoContaId`) é opcional e precisa ser uma conta analítica e ativa do tipo certo (receita ou despesa). O centro de custo também é opcional e precisa estar ativo. Os dois podem ser definidos ou trocados depois, inclusive em contas pagas ou canceladas; envie `null` para remover.
- Uma conta aceita várias baixas. Cada baixa exige `contaBancariaId` (conta ativa da empresa) e informa o principal abatido (`valor`, padrão: todo o saldo), `juros`, `multa`, `desconto` e `data` (padrão: hoje). O valor movimentado no banco é `valor + juros + multa - desconto`.
- Status: `ABERTA` sem baixas, `PARCIAL` com saldo restante, `PAGA` quando o saldo zera. O principal nunca passa do saldo, mesmo com baixas simultâneas (a conta é travada durante a baixa).
- Estornar uma baixa remove ela e sua movimentação, e o status é recalculado. Só contas sem baixas podem ser canceladas.
- Parcelamento: os centavos que sobram da divisão vão para as primeiras parcelas, e o vencimento cai no mesmo dia de cada mês (ou no último dia, se o mês for mais curto). As parcelas compartilham o `parcelamentoId`.

Movimentação bancária:

- O saldo de uma conta é o saldo inicial mais as entradas e menos as saídas até a data consultada. Somas são feitas em centavos inteiros.
- Cada baixa gera, na mesma transação, uma entrada (a receber) ou saída (a pagar) na conta bancária. O estorno da baixa remove essa movimentação; ela não pode ser apagada diretamente.
- Transferências geram uma saída e uma entrada ligadas por `transferenciaId`; remover uma remove as duas.
- Movimentações avulsas aceitam categoria (receita na entrada, despesa na saída) e centro de custo.
- Nenhuma movimentação pode ter data anterior à data do saldo inicial da conta, e essa data não pode ser movida para depois de uma movimentação existente.
- "Hoje" é calculado no fuso de `APP_TIMEZONE` (padrão `America/Sao_Paulo`), não em UTC.

Relatórios:

- **Fluxo de caixa**: contas bancárias abertas dentro do período entram com o saldo inicial no período da abertura (`aberturas`). Realizado são as movimentações bancárias (sem transferências, que não mudam o caixa da empresa); previsto é o saldo em aberto das contas pelo vencimento. O saldo de cada período acumula os dois a partir do saldo bancário na véspera de `de`.
- **DRE**: por competência, contas não canceladas pela data de emissão e pelo valor original; por caixa, baixas pela data e pelo valor pago. Nos dois regimes entram as movimentações avulsas com categoria. Valores sem categoria aparecem em `semCategoria`.
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
| `test/contas-receber.e2e-spec.ts` | Plano de contas padrão, categoria e centro de custo, baixa com conta bancária, datas e estados da conta |
| `test/contas-pagar.e2e-spec.ts` | As mesmas regras para contas a pagar, mais isolamento e permissões |
| `test/movimentacoes.e2e-spec.ts` | Baixa e estorno com movimentação, avulsas, transferências, saldo, extrato, isolamento e permissões |
| `test/financeiro.e2e-spec.ts` | Baixas parciais (inclusive simultâneas), juros/multa/desconto, parcelamento, fluxo de caixa e DRE |
| `test/sessao-cookie.e2e-spec.ts` | Sessão em cookie httpOnly, CSRF nas escritas, troca de empresa, senha e logout |
| `test/seguranca.e2e-spec.ts` | Bloqueio por senhas erradas, revogação de tokens, senhas fracas, auditoria, cabeçalhos, CORS, limite por IP e segredo do JWT |

A cada push na `main` e em cada pull request, o GitHub Actions compila o projeto, aplica as migrations num PostgreSQL 16, confere se elas batem com as entidades e roda os testes e2e (`.github/workflows/ci.yml`).

## Migrations

O schema é controlado só por migrations (`synchronize: false`).
Depois de alterar uma entidade:

```bash
npm run migration:generate -- src/database/migrations/NomeDaMudanca
npm run migration:run
```
