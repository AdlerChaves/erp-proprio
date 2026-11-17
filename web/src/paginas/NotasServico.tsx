import { Badge, SegmentedControl, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, consulta } from '../api/cliente';
import type { NotaServico, StatusNotaServico } from '../api/tipos';
import { Cabecalho, EstadoVazio, MenuAcoes, Valor } from '../componentes/comum';
import { STATUS_NOTA, useAcoesNota } from '../componentes/Fiscal';
import { Corta, TabelaDados } from '../componentes/TabelaDados';
import { data, moeda } from '../util/formato';

const ABAS: { value: StatusNotaServico | 'TODAS'; label: string }[] = [
  { value: 'PENDENTE', label: 'A emitir' },
  { value: 'EMITIDA', label: 'Emitidas' },
  { value: 'CANCELADA', label: 'Canceladas' },
  { value: 'TODAS', label: 'Todas' },
];

const valorDa = (n: NotaServico) => n.valorServicos - n.descontoIncondicionado;

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
      <TabelaDados<NotaServico>
        linhas={lista.data}
        erro={lista.error}
        aoTentarDeNovo={() => lista.refetch()}
        chave={(n) => n.id}
        contagem={['nota', 'notas']}
        placeholderBusca="Buscar DPS, NFS-e ou cliente"
        textoBusca={(n) => [n.numeroDps, n.numeroNfse, n.cliente.nome, n.descricao, n.venda?.numero, moeda(valorDa(n))].filter(Boolean).join(' ')}
        ordemInicial={{ coluna: 'dps', direcao: 'desc' }}
        larguraMinima={820}
        filtros={<SegmentedControl value={aba} onChange={(v) => setAba(v as typeof aba)} data={ABAS} aria-label="Situação" />}
        vazio={
          <EstadoVazio
            mensagem={aba === 'PENDENTE' ? 'Nenhuma nota a emitir. Gere a nota no detalhe de uma venda faturada.' : 'Nenhuma nota com esta situação.'}
          />
        }
        colunas={[
          {
            id: 'dps',
            titulo: 'DPS',
            largura: 90,
            ordenar: (n) => n.numeroDps,
            celula: (n) => (
              <>
                <Text size="sm" fw={600}>
                  {n.numeroDps}
                </Text>
                {n.ambiente === 2 && (
                  <Text size="xs" c="dimmed">
                    homologação
                  </Text>
                )}
              </>
            ),
          },
          { id: 'competencia', titulo: 'Competência', largura: 120, ordenar: (n) => n.dataCompetencia, celula: (n) => data(n.dataCompetencia) },
          {
            id: 'cliente',
            titulo: 'Cliente',
            ordenar: (n) => n.cliente.nome,
            celula: (n) => (
              <>
                <Corta>{n.cliente.nome}</Corta>
                <Text size="xs" c="dimmed" truncate title={n.descricao}>
                  {n.descricao.split('\n')[0]}
                </Text>
              </>
            ),
          },
          { id: 'venda', titulo: 'Venda', largura: 80, ordenar: (n) => n.venda?.numero, celula: (n) => (n.venda ? `nº ${n.venda.numero}` : '—') },
          {
            id: 'valor',
            titulo: 'Valor',
            alinhar: 'right',
            largura: 140,
            ordenar: valorDa,
            celula: (n) => (
              <>
                <Valor valor={valorDa(n)} />
                {n.issRetido && (
                  <Text size="xs" c="dimmed">
                    ISS retido
                  </Text>
                )}
              </>
            ),
          },
          {
            id: 'nfse',
            titulo: 'NFS-e',
            largura: 120,
            ordenar: (n) => n.numeroNfse,
            celula: (n) =>
              n.numeroNfse ? (
                <>
                  {n.numeroNfse}
                  <Text size="xs" c="dimmed">
                    {data(n.dataEmissaoNfse)}
                  </Text>
                </>
              ) : (
                '—'
              ),
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            largura: 160,
            ordenar: (n) => STATUS_NOTA[n.status].rotulo,
            celula: (n) => (
              <>
                <Badge color={STATUS_NOTA[n.status].cor}>{STATUS_NOTA[n.status].rotulo}</Badge>
                {n.status === 'PENDENTE' && n.erroTransmissao && (
                  <Text size="xs" c="red.9" lineClamp={3} title={n.erroTransmissao} style={{ whiteSpace: 'normal' }}>
                    {n.erroTransmissao}
                  </Text>
                )}
              </>
            ),
          },
        ]}
        acoes={(n) => <MenuAcoes rotulo={`DPS ${n.numeroDps}`} itens={acoes.itens(n)} />}
      />
      {acoes.modais}
    </>
  );
}
