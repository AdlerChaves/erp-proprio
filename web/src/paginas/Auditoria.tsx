import { Badge, Button, Card, Code, Group, Loader, Modal, Pagination, Select, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { PaginaAuditoria, RegistroAuditoria, UsuarioDaEmpresa } from '../api/tipos';
import { Cabecalho, CampoData, ErroCarregamento, SemPermissao } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { dataHora } from '../util/formato';

const POR_PAGINA = 50;

const RECURSOS = [
  { value: 'contas-receber', label: 'Contas a receber' },
  { value: 'contas-pagar', label: 'Contas a pagar' },
  { value: 'movimentacoes', label: 'Movimentações bancárias' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'fornecedores', label: 'Fornecedores' },
  { value: 'produtos', label: 'Produtos' },
  { value: 'contas-bancarias', label: 'Contas bancárias' },
  { value: 'plano-contas', label: 'Plano de contas' },
  { value: 'centros-custo', label: 'Centros de custo' },
  { value: 'usuarios', label: 'Usuários' },
  { value: 'empresas', label: 'Empresa' },
  { value: 'auth', label: 'Senha e sessões' },
];

const EVENTOS: Record<string, string> = {
  LOGIN: 'Entrou no sistema',
  REGISTRO: 'Cadastrou a empresa',
};
const VERBOS: Record<string, { texto: string; cor: string }> = {
  POST: { texto: 'Criou', cor: 'teal' },
  PATCH: { texto: 'Alterou', cor: 'blue' },
  PUT: { texto: 'Alterou', cor: 'blue' },
  DELETE: { texto: 'Removeu', cor: 'red' },
};

/** IPv4 que o Node recebe como IPv6 mapeado: "::ffff:10.0.0.5" → "10.0.0.5". */
const ipLegivel = (ip: string) => ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');

/** "POST /api/contas-receber/:id/baixas" → verbo "Criou" e caminho "contas-receber/:id/baixas". */
function Acao({ acao }: { acao: string }) {
  if (EVENTOS[acao]) return <Text size="sm">{EVENTOS[acao]}</Text>;
  const [metodo, caminho] = acao.split(' ');
  const verbo = VERBOS[metodo];
  if (!verbo || !caminho) return <Text size="sm">{acao}</Text>;
  return (
    <Group gap={6} wrap="nowrap">
      <Badge size="sm" variant="light" color={verbo.cor} miw={78} style={{ flexShrink: 0 }}>
        {verbo.texto}
      </Badge>
      <Text size="sm" ff="monospace">
        {caminho.replace(/^\/api\//, '')}
      </Text>
    </Group>
  );
}

export function Auditoria() {
  const { pode } = useSessao();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [recurso, setRecurso] = useState<string | null>(null);
  const [de, setDe] = useState<string | null>(null);
  const [ate, setAte] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<RegistroAuditoria | null>(null);
  const permitido = pode('administrar');

  const usuarios = useQuery({ queryKey: ['/usuarios'], queryFn: () => api.get<UsuarioDaEmpresa[]>('/usuarios'), enabled: permitido });
  const filtro = consulta({ usuarioId, recurso, de, ate, limite: POR_PAGINA, deslocamento: (pagina - 1) * POR_PAGINA });
  const registros = useQuery({
    queryKey: ['auditoria', filtro],
    queryFn: () => api.get<PaginaAuditoria>(`/auditoria${filtro}`),
    enabled: permitido,
    placeholderData: (anterior) => anterior,
  });

  if (!permitido) return <SemPermissao titulo="Auditoria" />;
  const nomeDe = (id: string | null) => (id ? (usuarios.data?.find((u) => u.id === id)?.nome ?? 'Usuário removido') : '—');
  /** Mudar um filtro volta para a primeira página. */
  const filtrar =
    <T,>(definir: (v: T) => void) =>
    (v: T) => {
      definir(v);
      setPagina(1);
    };
  const paginas = registros.data ? Math.max(1, Math.ceil(registros.data.total / POR_PAGINA)) : 1;

  return (
    <>
      <Cabecalho titulo="Auditoria" descricao="Quem fez o quê nesta empresa, do mais recente para o mais antigo" />
      <Card withBorder padding={0}>
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} p="md">
          <Select
            label="Usuário"
            placeholder="Todos"
            data={(usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome }))}
            value={usuarioId}
            onChange={filtrar(setUsuarioId)}
            clearable
            searchable
          />
          <Select label="Área" placeholder="Todas" data={RECURSOS} value={recurso} onChange={filtrar(setRecurso)} clearable />
          <CampoData label="De" value={de} onChange={filtrar(setDe)} clearable />
          <CampoData label="Até" value={ate} onChange={filtrar(setAte)} clearable />
        </SimpleGrid>
        {registros.isPending ? (
          <Loader m="md" />
        ) : registros.isError ? (
          <ErroCarregamento erro={registros.error} />
        ) : registros.data.itens.length === 0 ? (
          <Text c="dimmed" p="md">
            Nenhum registro com estes filtros.
          </Text>
        ) : (
          <>
            <Table.ScrollContainer minWidth={760}>
              <Table highlightOnHover verticalSpacing="xs" style={{ opacity: registros.isPlaceholderData ? 0.6 : 1 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={150}>Quando</Table.Th>
                    <Table.Th w={180}>Usuário</Table.Th>
                    <Table.Th>Ação</Table.Th>
                    <Table.Th w={130}>IP</Table.Th>
                    <Table.Th w={90} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {registros.data.itens.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dataHora(r.criadoEm)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={1}>
                          {nomeDe(r.usuarioId)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Acao acao={r.acao} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {r.ip && ipLegivel(r.ip)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {(r.dados || r.recursoId) && (
                          <Button size="compact-xs" variant="subtle" onClick={() => setAberto(r)}>
                            Detalhes
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Group justify="space-between" p="md" wrap="wrap">
              <Text size="sm" c="dimmed">
                {registros.data.total} {registros.data.total === 1 ? 'registro' : 'registros'}
              </Text>
              {paginas > 1 && <Pagination total={paginas} value={pagina} onChange={setPagina} size="sm" />}
            </Group>
          </>
        )}
      </Card>
      <Modal opened={aberto !== null} onClose={() => setAberto(null)} title="Detalhes do registro" size="lg">
        {aberto && (
          <Stack gap="xs">
            <Text size="sm">
              {dataHora(aberto.criadoEm)} · {nomeDe(aberto.usuarioId)}
            </Text>
            <Acao acao={aberto.acao} />
            {aberto.recursoId && (
              <Text size="sm">
                Registro afetado: <Code>{aberto.recursoId}</Code>
              </Text>
            )}
            {aberto.dados && (
              <>
                <Text size="sm" fw={500}>
                  Dados enviados (senhas e tokens ocultos)
                </Text>
                <Code block style={{ maxHeight: 360, overflow: 'auto' }}>
                  {JSON.stringify(aberto.dados, null, 2)}
                </Code>
              </>
            )}
          </Stack>
        )}
      </Modal>
    </>
  );
}
