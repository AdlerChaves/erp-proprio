import { Badge, Card, Loader, Table, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { NotaServico, StatusNotaServico } from '../api/tipos';
import { Cabecalho, ErroCarregamento, MenuAcoes } from '../componentes/comum';
import { STATUS_NOTA, useAcoesNota } from '../componentes/Fiscal';
import { data, moeda } from '../util/formato';

const ABAS: { value: StatusNotaServico | 'TODAS'; label: string }[] = [
  { value: 'PENDENTE', label: 'A emitir' },
  { value: 'EMITIDA', label: 'Emitidas' },
  { value: 'CANCELADA', label: 'Canceladas' },
  { value: 'TODAS', label: 'Todas' },
];

export function NotasServico() {
  const [aba, setAba] = useState<StatusNotaServico | 'TODAS'>('PENDENTE');
  const acoes = useAcoesNota();
  const filtro = consulta({ status: aba === 'TODAS' ? undefined : aba });
  const lista = useQuery({ queryKey: ['notas-servico', filtro], queryFn: () => api.get<NotaServico[]>(`/notas-servico${filtro}`) });

  return (
    <>
      <Cabecalho
        titulo="Notas de serviço"
        descricao="DPS geradas a partir das vendas faturadas. Transmita pelo menu de cada nota: o ERP assina e emite a NFS-e no Emissor Nacional."
      />
      <Card withBorder padding={0}>
        <Tabs value={aba} onChange={(v) => setAba((v as typeof aba) ?? 'PENDENTE')}>
          <Tabs.List px="md" pt="xs">
            {ABAS.map((a) => (
              <Tabs.Tab key={a.value} value={a.value}>
                {a.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        {lista.isPending ? (
          <Loader m="md" />
        ) : lista.isError ? (
          <ErroCarregamento erro={lista.error} />
        ) : lista.data.length === 0 ? (
          <Text c="dimmed" p="md">
            {aba === 'PENDENTE' ? 'Nenhuma nota a emitir. Gere a nota no detalhe de uma venda faturada.' : 'Nenhuma nota encontrada.'}
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={80}>DPS</Table.Th>
                  <Table.Th w={110}>Competência</Table.Th>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th w={80}>Venda</Table.Th>
                  <Table.Th ta="right">Valor</Table.Th>
                  <Table.Th>NFS-e</Table.Th>
                  <Table.Th w={110}>Situação</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lista.data.map((n) => (
                  <Table.Tr key={n.id}>
                    <Table.Td fw={600}>
                      {n.numeroDps}
                      {n.ambiente === 2 && (
                        <Text size="xs" c="dimmed">
                          homologação
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{data(n.dataCompetencia)}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{n.cliente.nome}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {n.descricao.split('\n')[0]}
                      </Text>
                    </Table.Td>
                    <Table.Td>{n.venda ? `nº ${n.venda.numero}` : '—'}</Table.Td>
                    <Table.Td ta="right">
                      {moeda(n.valorServicos - n.descontoIncondicionado)}
                      {n.issRetido && (
                        <Text size="xs" c="dimmed">
                          ISS retido
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {n.numeroNfse ? (
                        <>
                          {n.numeroNfse}
                          <Text size="xs" c="dimmed">
                            {data(n.dataEmissaoNfse)}
                          </Text>
                        </>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={STATUS_NOTA[n.status].cor}>
                        {STATUS_NOTA[n.status].rotulo}
                      </Badge>
                      {n.status === 'PENDENTE' && n.erroTransmissao && (
                        <Text size="xs" c="red" lineClamp={3} title={n.erroTransmissao}>
                          {n.erroTransmissao}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <MenuAcoes rotulo={`DPS ${n.numeroDps}`} itens={acoes.itens(n)} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      {acoes.modais}
    </>
  );
}
