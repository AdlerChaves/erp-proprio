import { ActionIcon, Anchor, Button, Checkbox, Divider, Drawer, Group, Select, Skeleton, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { useMediaQuery, useReducedMotion } from '@mantine/hooks';
import { IconArrowDown, IconArrowUp, IconMaximize, IconMinimize, IconNote, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/cliente';
import type { EtapaObra, Obra, PainelApontamento, SituacaoObra } from '../api/tipos';
import { avisarErro, avisarSucesso, Cabecalho, CampoData, ErroCarregamento, EstadoVazio } from '../componentes/comum';
import { useSessao } from '../sessao/sessao';
import { classificar, etapaAtual, ordenarObras, rotuloPrazo, SITUACOES_OBRA } from '../util/apontamento';
import css from './Apontamento.module.css';

const CHAVE = ['apontamento'];
/** Com mais obras que isto, as colunas passam a rolar sozinhas. */
const MAXIMO_VISIVEL = 9;
/** Segundos para cada coluna atravessar a tela na rolagem automática. */
const SEGUNDOS_POR_COLUNA = 9;

/** Hora atual, renovada a cada `intervalo` ms (relógio do topo e cálculo de "hoje"). */
function useAgora(intervalo: number) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervalo);
    return () => clearInterval(id);
  }, [intervalo]);
  return agora;
}

/** Grade para até 9 obras: 1 a 3 numa linha, 4 em 2×2, 5 e 6 em 3×2, 7 a 9 em 3×3. */
function grade(n: number) {
  const colunas = n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : 3;
  return { colunas, linhas: Math.max(1, Math.ceil(n / colunas)) };
}

function CardObra({ obra, hoje, diasAlerta, aoAbrir, copia }: { obra: Obra; hoje: string; diasAlerta: number; aoAbrir: (id: string) => void; copia?: boolean }) {
  const cronograma = classificar(obra, hoje, diasAlerta);
  const { etapa, indice, total } = etapaAtual(obra);
  const prazo = rotuloPrazo(obra, hoje);
  const situacao = obra.situacao ? SITUACOES_OBRA[obra.situacao] : null;
  const concluida = obra.situacao === 'CONCLUIDO';
  const tecla = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    aoAbrir(obra.id);
  };

  return (
    <article
      className={css.card}
      data-cronograma={cronograma}
      role="button"
      tabIndex={copia ? -1 : 0}
      aria-hidden={copia || undefined}
      aria-label={`${obra.nome}: ${etapa?.nome ?? 'sem etapa em andamento'}, ${prazo}`}
      onClick={() => aoAbrir(obra.id)}
      onKeyDown={tecla}
    >
      <div className={css.linha1}>
        <span className={css.nome} title={obra.nome}>
          {obra.nome}
        </span>
        {situacao && (
          <span className={css.situacao} data-aguardando={situacao.aguardando || undefined}>
            {situacao.rotulo}
          </span>
        )}
      </div>

      <div className={css.etapa}>
        {total === 0 ? (
          <span className={css.rotulo}>Nenhuma etapa cadastrada</span>
        ) : (
          <>
            <span className={css.rotulo}>{etapa ? `Etapa ${indice + 1} de ${total}` : `${total} de ${total} etapas`}</span>
            <span className={css.etapaNome} title={etapa?.nome}>
              {concluida ? 'Obra concluída' : (etapa?.nome ?? 'Todas as etapas concluídas')}
            </span>
            <div className={css.segmentos} style={{ '--total': total } as CSSProperties}>
              {obra.etapas.map((e, k) => (
                <i key={e.id} data-estado={e.concluidaEm ? 'feita' : k === indice ? 'atual' : undefined} />
              ))}
            </div>
          </>
        )}
      </div>

      {obra.observacao && (
        <p className={css.observacao} title={obra.observacao}>
          <IconNote size={15} />
          <span>{obra.observacao}</span>
        </p>
      )}

      <div className={css.prazo}>
        <span>{etapa?.dataLimite ? `Limite ${dayjs(etapa.dataLimite).format('DD/MM')}` : '—'}</span>
        <b>{prazo}</b>
      </div>
    </article>
  );
}

/** Os cards em grade; com mais de 9, colunas que rolam devagar para a esquerda e voltam ao início sem salto. */
function QuadroObras({
  obras,
  hoje,
  diasAlerta,
  pausado,
  aoAbrir,
}: {
  obras: Obra[];
  hoje: string;
  diasAlerta: number;
  pausado: boolean;
  aoAbrir: (id: string) => void;
}) {
  const celular = useMediaQuery('(max-width: 48em)');
  const reduzir = useReducedMotion();
  const trilho = useRef<HTMLDivElement>(null);
  const [sobre, setSobre] = useState(false);
  const pausa = useRef(false);
  pausa.current = pausado || sobre;

  const muitas = obras.length > MAXIMO_VISIVEL && !celular;
  const rolagem = muitas && !reduzir;

  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    el.style.transform = '';
    if (!rolagem) return;
    let x = 0;
    let anterior = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const dt = Math.min(agora - anterior, 64);
      anterior = agora;
      const primeiro = el.children[0] as HTMLElement | undefined;
      if (!pausa.current && primeiro) {
        const coluna = primeiro.getBoundingClientRect().width + (parseFloat(getComputedStyle(el).columnGap) || 0);
        const volta = Math.ceil(obras.length / 3) * coluna;
        x -= (coluna / SEGUNDOS_POR_COLUNA) * (dt / 1000);
        if (-x >= volta) x += volta;
        el.style.transform = `translateX(${x}px)`;
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [rolagem, obras.length]);

  const { colunas, linhas } = grade(obras.length);
  const card = (o: Obra, copia = false) => <CardObra key={copia ? `${o.id}-copia` : o.id} obra={o} hoje={hoje} diasAlerta={diasAlerta} aoAbrir={aoAbrir} copia={copia} />;

  return (
    <div
      className={css.janela}
      data-rolagem-manual={(muitas && !rolagem) || undefined}
      onMouseEnter={() => setSobre(true)}
      onMouseLeave={() => setSobre(false)}
      onFocus={() => setSobre(true)}
      onBlur={() => setSobre(false)}
    >
      <div ref={trilho} className={css.trilho} data-modo={muitas ? 'rolagem' : 'grade'} style={{ '--colunas': colunas, '--linhas': linhas } as CSSProperties}>
        {obras.map((o) => card(o))}
        {/* Segunda volta dos cards, para a rolagem emendar sem buraco; fora da leitura de tela e do Tab. */}
        {rolagem && obras.map((o) => card(o, true))}
      </div>
    </div>
  );
}

const OPCOES_SITUACAO = (Object.keys(SITUACOES_OBRA) as SituacaoObra[]).map((s) => ({ value: s, label: SITUACOES_OBRA[s].rotulo }));

/** Detalhe da obra: etapas, situação e observação. Só administrador e financeiro alteram. */
function DetalheObra({ obra, escrever, hoje }: { obra: Obra; escrever: boolean; hoje: string }) {
  const queryClient = useQueryClient();
  const [situacao, setSituacao] = useState<SituacaoObra | null>(obra.situacao);
  const [observacao, setObservacao] = useState(obra.observacao ?? '');
  const [novaEtapa, setNovaEtapa] = useState('');
  const [novaData, setNovaData] = useState<string | null>(null);
  const rota = `/apontamento/${obra.id}`;
  const { indice } = etapaAtual(obra);

  const alterar = useMutation({
    mutationFn: (chamada: () => Promise<unknown>) => chamada(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
    onError: avisarErro,
  });
  const executar = (chamada: () => Promise<unknown>, aviso?: string) => alterar.mutate(chamada, { onSuccess: () => aviso && avisarSucesso(aviso) });

  const salvarObra = () => executar(() => api.patch(rota, { situacao, observacao: observacao.trim() || null }), 'Situação e observação salvas');
  const atualizarEtapa = (e: EtapaObra, dados: Record<string, unknown>) => executar(() => api.patch(`${rota}/etapas/${e.id}`, dados));
  const mover = (posicao: number, passo: -1 | 1) => {
    const ids = obra.etapas.map((e) => e.id);
    const destino = posicao + passo;
    if (destino < 0 || destino >= ids.length) return;
    [ids[posicao], ids[destino]] = [ids[destino], ids[posicao]];
    executar(() => api.put(`${rota}/etapas/ordem`, { ids }));
  };
  const incluir = () => {
    if (!novaEtapa.trim()) return;
    executar(() => api.post(`${rota}/etapas`, { nome: novaEtapa.trim(), dataLimite: novaData }), 'Etapa incluída');
    setNovaEtapa('');
    setNovaData(null);
  };
  const alterado = situacao !== obra.situacao || (observacao.trim() || null) !== obra.observacao;

  return (
    <Stack gap="md">
      <Group justify="space-between" gap="xs">
        <Text size="sm" c="dimmed">
          {rotuloPrazo(obra, hoje)}
        </Text>
        <Anchor component={Link} to="/centros-custo" size="sm">
          Resultado financeiro do Centro de Custo
        </Anchor>
      </Group>

      <Select
        label="Situação"
        placeholder="Não informada"
        data={OPCOES_SITUACAO}
        value={situacao}
        onChange={(v) => setSituacao(v as SituacaoObra | null)}
        clearable
        disabled={!escrever}
      />
      <Textarea
        label="Observação"
        description="Aparece no card do painel"
        placeholder="Ex.: disjuntores chegam na quinta"
        maxLength={500}
        autosize
        minRows={2}
        maxRows={5}
        value={observacao}
        onChange={(e) => setObservacao(e.currentTarget.value)}
        disabled={!escrever}
      />
      {escrever && (
        <Group justify="flex-end">
          <Button onClick={salvarObra} disabled={!alterado} loading={alterar.isPending}>
            Salvar situação e observação
          </Button>
        </Group>
      )}

      <Divider label="Etapas" labelPosition="left" />
      {obra.etapas.length === 0 ? (
        <EstadoVazio
          mensagem="Esta obra ainda não tem etapas."
          acao={
            escrever && (
              <Stack gap={6} align="center">
                <Button variant="default" size="xs" onClick={() => executar(() => api.post(`${rota}/etapas/padrao`), 'Etapas padrão aplicadas')}>
                  Aplicar etapas padrão
                </Button>
                <Anchor component={Link} to="/etapas-padrao" size="xs">
                  Ver ou mudar as etapas padrão
                </Anchor>
              </Stack>
            )
          }
        />
      ) : (
        <Stack gap={6}>
          {obra.etapas.map((e, k) => (
            <Group key={e.id} gap={6} wrap="nowrap" align="center">
              <Checkbox
                aria-label={`${e.nome} concluída`}
                checked={!!e.concluidaEm}
                disabled={!escrever}
                onChange={(ev) => atualizarEtapa(e, { concluida: ev.currentTarget.checked })}
              />
              {escrever ? (
                <TextInput
                  key={`${e.id}-${e.nome}`}
                  size="xs"
                  defaultValue={e.nome}
                  aria-label={`Nome da etapa ${k + 1}`}
                  fw={k === indice ? 600 : undefined}
                  style={{ flex: 1, minWidth: 0 }}
                  onBlur={(ev) => {
                    const nome = ev.currentTarget.value.trim();
                    if (nome && nome !== e.nome) atualizarEtapa(e, { nome });
                  }}
                />
              ) : (
                <Text size="sm" fw={k === indice ? 600 : undefined} td={e.concluidaEm ? 'line-through' : undefined} style={{ flex: 1 }}>
                  {e.nome}
                </Text>
              )}
              <CampoData
                size="xs"
                w={128}
                aria-label={`Data limite de ${e.nome}`}
                placeholder="Sem data"
                value={e.dataLimite}
                onChange={(v) => atualizarEtapa(e, { dataLimite: v })}
                clearable
                disabled={!escrever}
              />
              {escrever && (
                <>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Subir ${e.nome}`} disabled={k === 0} onClick={() => mover(k, -1)}>
                    <IconArrowUp size={14} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label={`Descer ${e.nome}`} disabled={k === obra.etapas.length - 1} onClick={() => mover(k, 1)}>
                    <IconArrowDown size={14} />
                  </ActionIcon>
                  <Tooltip label="Excluir etapa">
                    <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Excluir ${e.nome}`} onClick={() => executar(() => api.delete(`${rota}/etapas/${e.id}`))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          ))}
        </Stack>
      )}

      {escrever && (
        <Group gap={6} wrap="nowrap" align="flex-end">
          <TextInput
            size="xs"
            label="Nova etapa"
            placeholder="Nome da etapa"
            maxLength={100}
            value={novaEtapa}
            onChange={(ev) => setNovaEtapa(ev.currentTarget.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && incluir()}
            style={{ flex: 1 }}
          />
          <CampoData size="xs" w={128} label="Data limite" placeholder="Sem data" value={novaData} onChange={setNovaData} clearable />
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={incluir} disabled={!novaEtapa.trim()}>
            Incluir
          </Button>
        </Group>
      )}
    </Stack>
  );
}

/** Painel de apontamento: cada Centro de Custo ativo é uma obra, com etapa atual, prazo, situação e observação. */
export function Apontamento() {
  const { pode } = useSessao();
  const escrever = pode('escreverCadastros');
  const painel = useQuery({
    queryKey: CHAVE,
    queryFn: () => api.get<PainelApontamento>('/apontamento'),
    // Painel que fica aberto num monitor: atualiza sozinho, sem recarregar a página.
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
  const agora = useAgora(30_000);
  const hoje = dayjs(agora).format('YYYY-MM-DD');
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);

  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);
  useEffect(() => {
    if (!telaCheia) return;
    const tecla = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && !abertaId && setTelaCheia(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [telaCheia, abertaId]);

  const alternarTelaCheia = () => {
    if (telaCheia) {
      setTelaCheia(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    } else {
      setTelaCheia(true);
      // Sem tela cheia do navegador (bloqueada ou indisponível), o painel ainda ocupa a janela inteira.
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  };

  const diasAlerta = painel.data?.diasAlerta ?? 3;
  const obras = useMemo(() => (painel.data ? ordenarObras(painel.data.obras, hoje, diasAlerta) : []), [painel.data, hoje, diasAlerta]);
  const contagem = useMemo(() => {
    const total = { atraso: 0, atencao: 0, ok: 0, aguardando: 0 };
    for (const o of obras) {
      const c = classificar(o, hoje, diasAlerta);
      if (c !== 'neutro') total[c]++;
      if (o.situacao && SITUACOES_OBRA[o.situacao].aguardando) total.aguardando++;
    }
    return total;
  }, [obras, hoje, diasAlerta]);
  const aberta = painel.data?.obras.find((o) => o.id === abertaId) ?? null;
  const botaoTelaCheia = (
    <Button variant="default" leftSection={telaCheia ? <IconMinimize size={16} /> : <IconMaximize size={16} />} onClick={alternarTelaCheia}>
      {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
    </Button>
  );

  return (
    <>
      <Cabecalho titulo="Apontamento" descricao="Andamento das obras de cada Centro de Custo" acoes={botaoTelaCheia} />
      <div className={css.painel} data-tela-cheia={telaCheia || undefined}>
        {painel.isError ? (
          <ErroCarregamento erro={painel.error} aoTentarDeNovo={() => painel.refetch()} />
        ) : !painel.data ? (
          <Skeleton h="100%" radius="md" />
        ) : obras.length === 0 ? (
          <EstadoVazio
            mensagem="Nenhum Centro de Custo ativo. Cada obra é um Centro de Custo: cadastre as obras para acompanhá-las aqui."
            acao={
              <Button component={Link} to="/centros-custo" variant="default" size="xs">
                Cadastrar Centro de Custo
              </Button>
            }
          />
        ) : (
          <>
            <div className={css.topo}>
              <div className={css.titulo}>
                <b>Obras em andamento</b>
                <span>
                  {obras.length} {obras.length === 1 ? 'Centro de Custo' : 'Centros de Custo'}, atualizado às {dayjs(painel.dataUpdatedAt).format('HH:mm')}
                </span>
              </div>
              <div className={css.contadores}>
                <span className={css.contador}>
                  <i className={css.ponto} style={{ background: 'var(--atraso)' }} />
                  <b>{contagem.atraso}</b>
                  {contagem.atraso === 1 ? 'atrasada' : 'atrasadas'}
                </span>
                <span className={css.contador}>
                  <i className={css.ponto} style={{ background: 'var(--atencao)' }} />
                  <b>{contagem.atencao}</b>
                  vencem em breve
                </span>
                <span className={css.contador}>
                  <i className={css.ponto} style={{ background: 'var(--ok)' }} />
                  <b>{contagem.ok}</b>
                  no prazo
                </span>
                <span className={css.contador}>
                  <b>{contagem.aguardando}</b>
                  aguardando ação
                </span>
              </div>
              <div className={css.relogio}>
                <div>
                  <b>{dayjs(agora).format('HH:mm')}</b>
                  <span>{dayjs(agora).format('dddd, D [de] MMMM')}</span>
                </div>
                {telaCheia && botaoTelaCheia}
              </div>
            </div>
            <QuadroObras obras={obras} hoje={hoje} diasAlerta={diasAlerta} pausado={abertaId !== null} aoAbrir={setAbertaId} />
          </>
        )}
      </div>

      <Drawer opened={aberta !== null} onClose={() => setAbertaId(null)} title={aberta?.nome} position="right" size="lg" zIndex={300}>
        {aberta && <DetalheObra key={aberta.id} obra={aberta} escrever={escrever} hoje={hoje} />}
      </Drawer>
    </>
  );
}
