import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { api, ApiError, aoSessaoExpirar, definirCsrf } from '../api/cliente';
import type { EmpresaAcessivel, Me, Perfil, SessaoEntregue } from '../api/tipos';

export const CHAVE_SESSAO = ['sessao'] as const;

/** O que cada perfil pode fazer na tela; espelha as regras da API, que é quem decide de fato. */
const PERMISSOES = {
  escreverFinanceiro: ['ADMIN', 'FINANCEIRO'],
  escreverClientes: ['ADMIN', 'FINANCEIRO', 'VENDAS'],
  escreverProdutos: ['ADMIN', 'FINANCEIRO', 'VENDAS'],
  vender: ['ADMIN', 'FINANCEIRO', 'VENDAS'],
  escreverCadastros: ['ADMIN', 'FINANCEIRO'],
  remover: ['ADMIN'],
  verSaldos: ['ADMIN', 'FINANCEIRO', 'CONSULTA'],
  administrar: ['ADMIN'],
} satisfies Record<string, Perfil[]>;

export type Permissao = keyof typeof PERMISSOES;

interface ValorSessao {
  me: Me | null;
  carregando: boolean;
  pode: (permissao: Permissao) => boolean;
  /** Resolve com as empresas quando o usuário tem mais de uma e precisa escolher. */
  entrar: (email: string, senha: string, empresaId?: string) => Promise<{ escolher?: EmpresaAcessivel[] }>;
  registrar: (dados: unknown) => Promise<void>;
  trocarEmpresa: (empresaId: string) => Promise<void>;
  /** Os outros dispositivos saem; este recebe uma sessão nova. */
  alterarSenha: (senhaAtual: string, novaSenha: string) => Promise<void>;
  /** Recarrega usuário e empresas, por exemplo depois de renomear ou criar uma empresa. */
  atualizar: () => Promise<void>;
  sair: (todosDispositivos?: boolean) => Promise<void>;
}

const Contexto = createContext<ValorSessao | null>(null);

/** null quando não há sessão válida. */
async function buscarSessao(): Promise<Me | null> {
  try {
    const me = await api.get<Me>('/auth/me');
    definirCsrf(me.csrfToken);
    return me;
  } catch (erro) {
    if (erro instanceof ApiError && erro.status === 401) return null;
    throw erro;
  }
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: CHAVE_SESSAO, queryFn: buscarSessao, staleTime: Infinity, retry: false });

  /** Descarta tudo da empresa anterior e recarrega a sessão. */
  const recomecar = useCallback(
    async (sessao?: SessaoEntregue) => {
      definirCsrf(sessao?.csrfToken);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_SESSAO[0] });
      await queryClient.refetchQueries({ queryKey: CHAVE_SESSAO });
    },
    [queryClient],
  );

  useEffect(() => {
    aoSessaoExpirar(() => {
      definirCsrf(undefined);
      queryClient.setQueryData(CHAVE_SESSAO, null);
    });
  }, [queryClient]);

  const valor = useMemo<ValorSessao>(
    () => ({
      me: data ?? null,
      carregando: isPending,
      pode: (permissao) => !!data && (PERMISSOES[permissao] as Perfil[]).includes(data.perfil),
      entrar: async (email, senha, empresaId) => {
        try {
          await recomecar(await api.post<SessaoEntregue>('/auth/login', { email, senha, empresaId }));
          return {};
        } catch (erro) {
          const empresas = (erro as ApiError).corpo as { empresas?: EmpresaAcessivel[] } | undefined;
          if (erro instanceof ApiError && erro.status === 400 && empresas?.empresas) return { escolher: empresas.empresas };
          throw erro;
        }
      },
      registrar: async (dados) => recomecar(await api.post<SessaoEntregue>('/auth/registrar', dados)),
      trocarEmpresa: async (empresaId) =>
        recomecar(await api.post<SessaoEntregue>('/auth/trocar-empresa', { empresaId })),
      alterarSenha: async (senhaAtual, novaSenha) => {
        const sessao = await api.patch<SessaoEntregue>('/auth/senha', { senhaAtual, novaSenha });
        definirCsrf(sessao.csrfToken);
        await queryClient.refetchQueries({ queryKey: CHAVE_SESSAO });
      },
      atualizar: async () => {
        await queryClient.refetchQueries({ queryKey: CHAVE_SESSAO });
      },
      sair: async (todosDispositivos = false) => {
        await api.post(todosDispositivos ? '/auth/sessoes/encerrar' : '/auth/logout').catch(() => undefined);
        definirCsrf(undefined);
        // A sessão vira null no lugar, sem remover a consulta: quem a observa precisa ser avisado.
        // Um clear() deixaria a tela presa à consulta removida, ainda com o usuário logado.
        queryClient.setQueryData(CHAVE_SESSAO, null);
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== CHAVE_SESSAO[0] });
      },
    }),
    [data, isPending, queryClient, recomecar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSessao precisa estar dentro de SessaoProvider');
  return valor;
}
