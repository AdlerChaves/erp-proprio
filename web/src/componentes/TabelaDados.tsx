import { Button, CloseButton, Skeleton, Stack, Table, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconSearch } from '@tabler/icons-react';
import { type KeyboardEvent, type ReactNode, useMemo, useState } from 'react';
import { type Direcao, filtrarPorBusca, ordenarLinhas, type ValorOrdenacao } from '../util/tabela';
import { ErroCarregamento, EstadoVazio } from './comum';
import css from './TabelaDados.module.css';

export interface Coluna<T> {
  id: string;
  titulo: ReactNode;
  celula: (linha: T) => ReactNode;
  /** Valor usado para ordenar; sem ele, a coluna não ordena. */
  ordenar?: (linha: T) => ValorOrdenacao;
  alinhar?: 'right' | 'center';
  largura?: number | string;
}

interface Props<T> {
  /** `undefined` enquanto carrega. */
  linhas: T[] | undefined;
  colunas: Coluna<T>[];
  chave: (linha: T) => string;
  erro?: unknown;
  aoTentarDeNovo?: () => void;
  /** Texto em que a busca procura; sem ele, a tabela não tem campo de busca. */
  textoBusca?: (linha: T) => string;
  placeholderBusca?: string;
  /** Campos de filtro que ficam na barra, ao lado da busca. */
  filtros?: ReactNode;
  /** Como contar as linhas: ['conta', 'contas']. */
  contagem: [string, string];
  ordemInicial?: { coluna: string; direcao: Direcao };
  /** Mostrado quando não há nenhuma linha (antes da busca): explica o motivo e oferece o próximo passo. */
  vazio?: ReactNode;
  /** Ações da linha, na última coluna (ex.: menu "⋯"). Clicar nelas não dispara `aoClicarLinha`. */
  acoes?: (linha: T) => ReactNode;
  aoClicarLinha?: (linha: T) => void;
  /** Células do rodapé (totais), calculadas sobre as linhas visíveis depois da busca. */
  rodape?: (visiveis: T[]) => ReactNode;
  larguraMinima?: number;
}

/**
 * Tabela padrão das listagens: busca sem acento por todas as palavras, ordenação por coluna, contagem, ações na linha,
 * rolagem horizontal própria no celular e os estados de carregando, erro, vazio e sem resultado.
 */
export function TabelaDados<T>({
  linhas,
  colunas,
  chave,
  erro,
  aoTentarDeNovo,
  textoBusca,
  placeholderBusca = 'Buscar',
  filtros,
  contagem,
  ordemInicial,
  vazio,
  acoes,
  aoClicarLinha,
  rodape,
  larguraMinima = 760,
}: Props<T>) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<{ coluna: string; direcao: Direcao } | null>(ordemInicial ?? null);

  const visiveis = useMemo(() => {
    if (!linhas) return [];
    const filtradas = textoBusca ? filtrarPorBusca(linhas, busca, textoBusca) : linhas;
    if (!ordem) return filtradas;
    const coluna = colunas.find((c) => c.id === ordem.coluna);
    return coluna?.ordenar ? ordenarLinhas(filtradas, coluna.ordenar, ordem.direcao) : filtradas;
  }, [linhas, busca, textoBusca, ordem, colunas]);

  const alternarOrdem = (id: string) =>
    setOrdem((atual) => (atual?.coluna === id ? { coluna: id, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' } : { coluna: id, direcao: 'asc' }));

  const total = linhas?.length ?? 0;
  const [singular, plural] = contagem;
  const textoContagem =
    visiveis.length === total ? `${total} ${total === 1 ? singular : plural}` : `${visiveis.length} de ${total} ${total === 1 ? singular : plural}`;

  const teclaNaLinha = (e: KeyboardEvent, linha: T) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    aoClicarLinha?.(linha);
  };

  let corpo: ReactNode;
  if (erro) {
    corpo = (
      <Stack p="md">
        <ErroCarregamento erro={erro} aoTentarDeNovo={aoTentarDeNovo} />
      </Stack>
    );
  } else if (!linhas) {
    corpo = (
      <Stack gap={8} p="md" aria-busy="true" aria-label="Carregando">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} h={22} />
        ))}
      </Stack>
    );
  } else if (total === 0) {
    corpo = vazio ?? <EstadoVazio mensagem="Nada por aqui ainda." />;
  } else if (visiveis.length === 0) {
    corpo = (
      <EstadoVazio
        mensagem={busca.trim() ? `Nada encontrado para "${busca.trim()}".` : 'Nada encontrado com estes filtros.'}
        acao={
          busca.trim() && (
            <Button variant="default" size="xs" onClick={() => setBusca('')}>
              Limpar a busca
            </Button>
          )
        }
      />
    );
  } else {
    corpo = (
      <Table.ScrollContainer minWidth={larguraMinima} type="native">
        <Table highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {colunas.map((c) => {
                const ativa = ordem?.coluna === c.id;
                return (
                  <Table.Th
                    key={c.id}
                    ta={c.alinhar}
                    w={c.largura}
                    aria-sort={ativa ? (ordem?.direcao === 'asc' ? 'ascending' : 'descending') : c.ordenar ? 'none' : undefined}
                  >
                    {c.ordenar ? (
                      <button
                        type="button"
                        className={css.ordenar}
                        data-ativo={ativa || undefined}
                        data-direita={c.alinhar === 'right' || undefined}
                        onClick={() => alternarOrdem(c.id)}
                      >
                        {c.titulo}
                        {ativa && ordem.direcao === 'desc' ? <IconArrowDown size={13} /> : <IconArrowUp size={13} />}
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </Table.Th>
                );
              })}
              {acoes && <Table.Th w={48} aria-label="Ações" />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visiveis.map((linha) => (
              <Table.Tr
                key={chave(linha)}
                className={aoClicarLinha ? css.linhaClicavel : undefined}
                tabIndex={aoClicarLinha ? 0 : undefined}
                onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
                onKeyDown={aoClicarLinha ? (e) => teclaNaLinha(e, linha) : undefined}
              >
                {colunas.map((c) => (
                  <Table.Td key={c.id} ta={c.alinhar} style={{ maxWidth: c.largura ?? 320 }}>
                    {c.celula(linha)}
                  </Table.Td>
                ))}
                {acoes && (
                  <Table.Td ta="right" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {acoes(linha)}
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
          {rodape && (
            <Table.Tfoot>
              <Table.Tr>{rodape(visiveis)}</Table.Tr>
            </Table.Tfoot>
          )}
        </Table>
      </Table.ScrollContainer>
    );
  }

  return (
    <div className={css.moldura}>
      {(textoBusca || filtros) && (
        <div className={css.barra}>
          {textoBusca && (
            <TextInput
              className={css.busca}
              value={busca}
              onChange={(e) => setBusca(e.currentTarget.value)}
              placeholder={placeholderBusca}
              aria-label={placeholderBusca}
              leftSection={<IconSearch size={15} />}
              rightSection={busca && <CloseButton size="sm" aria-label="Limpar a busca" onClick={() => setBusca('')} />}
            />
          )}
          {filtros && <div className={css.filtros}>{filtros}</div>}
          {linhas && total > 0 && <span className={css.contagem}>{textoContagem}</span>}
        </div>
      )}
      {corpo}
    </div>
  );
}

/** Texto de célula numa linha só, com reticências e o texto inteiro no title. */
export function Corta({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className={css.corta} title={title ?? (typeof children === 'string' ? children : undefined)}>
      {children}
    </span>
  );
}
