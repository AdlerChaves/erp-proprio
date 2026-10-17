import { Center, Loader } from '@mantine/core';
import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { ContasBancarias } from './paginas/ContasBancarias';
import { Contas, PAGAR, RECEBER } from './paginas/Contas';
import { Cadastro, Login } from './paginas/Entrada';
import { Painel } from './paginas/Painel';
import { CLIENTES, FORNECEDORES, Pessoas } from './paginas/Pessoas';
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
          { path: '/contas-bancarias', element: <ContasBancarias /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
