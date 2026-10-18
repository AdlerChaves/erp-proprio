import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { Auditoria } from './paginas/Auditoria';
import { CentrosCusto } from './paginas/CentrosCusto';
import { ContasBancarias } from './paginas/ContasBancarias';
import { Contas, PAGAR, RECEBER } from './paginas/Contas';
import { Dre } from './paginas/Dre';
import { Empresa } from './paginas/Empresa';
import { Cadastro, Login } from './paginas/Entrada';
import { Extrato } from './paginas/Extrato';
import { Painel } from './paginas/Painel';
import { CLIENTES, FORNECEDORES, Pessoas } from './paginas/Pessoas';
import { PlanoContas } from './paginas/PlanoContas';
import { Produtos } from './paginas/Produtos';
import { Usuarios } from './paginas/Usuarios';
import { useSessao } from './sessao/sessao';

function Carregando() {
  return (
    <Center mih="100vh">
      <Loader />
    </Center>
  );
}

/** Só mostra as telas internas com sessão válida. */
function ComSessao() {
  const { me, carregando } = useSessao();
  if (carregando) return <Carregando />;
  return me ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Login e cadastro não fazem sentido para quem já está logado. */
function SemSessao() {
  const { me, carregando } = useSessao();
  if (carregando) return <Carregando />;
  return me ? <Navigate to="/" replace /> : <Outlet />;
}

export const rotas = createBrowserRouter([
  {
    element: <SemSessao />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/cadastro', element: <Cadastro /> },
    ],
  },
  {
    element: <ComSessao />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Painel /> },
          { path: '/contas-receber', element: <Contas key="receber" config={RECEBER} /> },
          { path: '/contas-pagar', element: <Contas key="pagar" config={PAGAR} /> },
          { path: '/clientes', element: <Pessoas key="clientes" config={CLIENTES} /> },
          { path: '/fornecedores', element: <Pessoas key="fornecedores" config={FORNECEDORES} /> },
          { path: '/extrato', element: <Extrato /> },
          { path: '/dre', element: <Dre /> },
          { path: '/produtos', element: <Produtos /> },
          { path: '/contas-bancarias', element: <ContasBancarias /> },
          { path: '/plano-contas', element: <PlanoContas /> },
          { path: '/centros-custo', element: <CentrosCusto /> },
          { path: '/empresa', element: <Empresa /> },
          { path: '/usuarios', element: <Usuarios /> },
          { path: '/auditoria', element: <Auditoria /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
