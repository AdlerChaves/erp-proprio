import { Box, Group, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import dayjs from 'dayjs';
import { type KeyboardEvent, type PointerEvent, useId, useMemo, useState } from 'react';
import { moeda } from '../util/formato';
import type { DiaProjetado, Nivel, Periodo } from '../util/projecao';

/**
 * Projeção do caixa em dois painéis com o mesmo eixo de datas: em cima, o saldo ao fim de cada dia (linha em
 * degraus, porque o saldo muda de um dia para o outro, com a faixa abaixo de zero em vermelho); embaixo, o que
 * entra (para cima) e o que sai (para baixo) em cada dia, semana ou mês. Uma escala por painel, nunca duas no mesmo.
 *
 * Cores validadas (dataviz/validate_palette.js, modo claro): entradas #0f8a72 e saídas #e8590c passam em
 * saturação, separação para daltonismo e contraste. O vermelho do saldo negativo é cor de estado (crítico) e vem
 * sempre com texto ("Negativo a partir de...").
 */

export const CORES_CAIXA = {
  entrada: '#0f8a72',
  saida: '#e8590c',
  positivo: '#0f8a72',
  negativo: '#e03131',
  base: '#a8a49c',
};
const COR = { ...CORES_CAIXA, grade: '#ece9e4', zero: '#b5b1a9', texto: '#4f4c46', textoFraco: '#8f8b82' };

const M = { esquerda: 76, direita: 16 };
const ALTURA_SALDO = 230;
const ALTURA_BARRAS = 120;
const TOPO = 22;
const EIXO = 26;
const VAO = 44;

const COMPACTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const CHEIO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/** Rótulos do eixo: por extenso abaixo de 10 mil; compactos ("R$ 20 mil") num eixo que passa disso. */
const rotuloEixo = (centavos: number, compacto: boolean) => (compacto ? COMPACTO : CHEIO).format(centavos / 100).replace(/ /g, ' ');

/** Marcas "redondas" (1, 2, 2,5 ou 5 × 10^n) cobrindo de min a max. */
function marcas(min: number, max: number, quantidade = 4) {
  const amplitude = max - min || Math.abs(max) || 1;
  const bruto = amplitude / quantidade;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => p >= bruto)!;
  const inicio = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const lista: number[] = [];
  for (let v = inicio; v <= fim + passo / 2; v += passo) lista.push(Math.round(v));
  return lista;
}

/** Marcas do eixo das datas, conforme o tamanho do período: segundas-feiras, inícios de mês ou de trimestre. */
function marcasDatas(serie: DiaProjetado[]) {
  const n = serie.length;
  const lista: { i: number; rotulo: string }[] = [{ i: 0, rotulo: 'Hoje' }];
  serie.forEach((d, i) => {
    if (i === 0) return;
    const dia = dayjs(d.data);
    if (n <= 45) {
      if (dia.day() === 1 && i > 2) lista.push({ i, rotulo: dia.format('DD/MM') });
    } else if (dia.date() === 1 && i > n / 30) {
      const passo = n > 400 ? 3 : n > 200 ? 2 : 1;
      if (dia.month() % passo === 0) lista.push({ i, rotulo: n > 200 || dia.month() === 0 ? dia.format('MMM/YY') : dia.format('MMM') });
    }
  });
  return lista;
}

const NOME_NIVEL: Record<Nivel, string> = { dia: 'dia', semana: 'semana', mes: 'mês' };

export function GraficoCaixa({
  serie,
  base,
  periodos,
  nivel,
}: {
  serie: DiaProjetado[];
  /** Mesma projeção sem a simulação, em cinza, para comparar. */
  base: DiaProjetado[] | null;
  periodos: Periodo[];
  nivel: Nivel;
}) {
  const { ref, width } = useElementSize();
  const id = useId().replace(/:/g, '');
  const [foco, setFoco] = useState<number | null>(null);
  const n = serie.length;
  const largura = Math.max(width, 320);
  const area = largura - M.esquerda - M.direita;
  const x = (i: number) => M.esquerda + (i / n) * area;

  // Painel do saldo.
  const saldos = [...serie, ...(base ?? [])].map((d) => d.saldo);
  const ticksSaldo = marcas(Math.min(0, ...saldos), Math.max(0, ...saldos));
  const [minS, maxS] = [ticksSaldo[0], ticksSaldo[ticksSaldo.length - 1]];
  const ySaldo = (v: number) => TOPO + ALTURA_SALDO - ((v - minS) / (maxS - minS || 1)) * ALTURA_SALDO;
  const compactoSaldo = Math.max(Math.abs(minS), Math.abs(maxS)) >= 1_000_000;

  // Painel das entradas e saídas.
  const topoBarras = TOPO + ALTURA_SALDO + EIXO + VAO;
  const maxE = Math.max(1, ...periodos.map((p) => p.entradas));
  const maxSa = Math.max(1, ...periodos.map((p) => p.saidas));
  const ticksBarras = marcas(-maxSa, maxE, 3);
  const [minB, maxB] = [ticksBarras[0], ticksBarras[ticksBarras.length - 1]];
  const yBarras = (v: number) => topoBarras + ALTURA_BARRAS - ((v - minB) / (maxB - minB || 1)) * ALTURA_BARRAS;
  const compactoBarras = Math.max(Math.abs(minB), Math.abs(maxB)) >= 1_000_000;
  const altura = topoBarras + ALTURA_BARRAS + EIXO;

  const indiceDe = useMemo(() => new Map(serie.map((d, i) => [d.data, i])), [serie]);
  /** Linha em degraus: o saldo do fim de cada dia vale do começo ao fim do dia. */
  const caminho = (s: DiaProjetado[]) => {
    let p = `M${x(0).toFixed(1)},${ySaldo(s[0].saldo).toFixed(1)}`;
    s.forEach((d, i) => {
      if (i > 0) p += `V${ySaldo(d.saldo).toFixed(1)}`;
      p += `H${x(i + 1).toFixed(1)}`;
    });
    return p;
  };
  const linha = caminho(serie);
  const zero = ySaldo(0);
  const preenchimento = `${linha}V${zero.toFixed(1)}H${x(0).toFixed(1)}Z`;

  let menor = 0;
  serie.forEach((d, i) => {
    if (d.saldo < serie[menor].saldo) menor = i;
  });
  const negativo = serie.findIndex((d) => d.saldo < 0);

  /** Coluna com a ponta arredondada (4px) e a base reta, crescendo da linha do zero para cima ou para baixo. */
  const coluna = (cx: number, w: number, de: number, ate: number) => {
    const r = Math.min(4, Math.abs(ate - de), w / 2);
    const esq = cx - w / 2;
    const s = ate < de ? 1 : -1;
    return `M${esq},${de}V${ate + s * r}Q${esq},${ate} ${esq + r},${ate}H${esq + w - r}Q${esq + w},${ate} ${esq + w},${ate + s * r}V${de}Z`;
  };

  const mover = (e: PointerEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - caixa.left) / caixa.width) * n);
    setFoco(Math.max(0, Math.min(n - 1, i)));
  };
  const teclar = (e: KeyboardEvent<SVGSVGElement>) => {
    const passo = e.shiftKey ? 7 : 1;
    if (e.key === 'ArrowRight') setFoco((f) => Math.min(n - 1, (f ?? -1) + passo));
    else if (e.key === 'ArrowLeft') setFoco((f) => Math.max(0, (f ?? 1) - passo));
    else if (e.key === 'Home') setFoco(0);
    else if (e.key === 'End') setFoco(n - 1);
    else if (e.key === 'Escape') setFoco(null);
    else return;
    e.preventDefault();
  };

  const dia = foco !== null ? serie[foco] : null;
  const periodoDoFoco = dia ? periodos.findIndex((p) => p.inicio <= dia.data && dia.data <= p.fim) : -1;
  const xFoco = foco !== null ? x(foco + 0.5) : 0;

  const rotuloMenor = `Menor saldo ${moeda(serie[menor].saldo / 100)} · ${dayjs(serie[menor].data).format('DD/MM')}`;
  const xMenor = x(menor + 0.5);
  const ancoraMenor = xMenor > largura - 200 ? 'end' : xMenor < M.esquerda + 120 ? 'start' : 'middle';
  const yMenor = ySaldo(serie[menor].saldo);
  const negativoADireita = negativo >= 0 && x(negativo) > largura - 220;

  return (
    <Box ref={ref} pos="relative">
      <svg
        width={largura}
        height={altura}
        role="img"
        tabIndex={0}
        aria-label={`Projeção do saldo de ${dayjs(serie[0].data).format('DD/MM/YYYY')} a ${dayjs(serie[n - 1].data).format('DD/MM/YYYY')}. ${rotuloMenor}. Use as setas para percorrer os dias.`}
        onKeyDown={teclar}
        onBlur={() => setFoco(null)}
        style={{ display: 'block', outline: 'none', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
      >
        <defs>
          <clipPath id={`acima-${id}`}>
            <rect x={0} y={0} width={largura} height={zero} />
          </clipPath>
          <clipPath id={`abaixo-${id}`}>
            <rect x={0} y={zero} width={largura} height={altura} />
          </clipPath>
        </defs>

        {/* Painel do saldo: grade, faixa abaixo de zero, linhas. */}
        {ticksSaldo.map((t) => (
          <g key={`s${t}`}>
            <line x1={M.esquerda} x2={largura - M.direita} y1={ySaldo(t)} y2={ySaldo(t)} stroke={t === 0 ? COR.zero : COR.grade} strokeWidth={1} />
            <text x={M.esquerda - 8} y={ySaldo(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={COR.textoFraco}>
              {rotuloEixo(t, compactoSaldo)}
            </text>
          </g>
        ))}
        {minS < 0 && <rect x={M.esquerda} y={zero} width={area} height={TOPO + ALTURA_SALDO - zero} fill={COR.negativo} opacity={0.04} />}
        <path d={preenchimento} fill={COR.positivo} opacity={0.1} clipPath={`url(#acima-${id})`} />
        <path d={preenchimento} fill={COR.negativo} opacity={0.12} clipPath={`url(#abaixo-${id})`} />
        {base && <path d={caminho(base)} fill="none" stroke={COR.base} strokeWidth={2} strokeLinejoin="round" />}
        <path d={linha} fill="none" stroke={COR.positivo} strokeWidth={2} strokeLinejoin="round" clipPath={`url(#acima-${id})`} />
        <path d={linha} fill="none" stroke={COR.negativo} strokeWidth={2} strokeLinejoin="round" clipPath={`url(#abaixo-${id})`} />

        {negativo >= 0 && (
          <g>
            <line x1={x(negativo)} x2={x(negativo)} y1={TOPO - 6} y2={TOPO + ALTURA_SALDO} stroke={COR.negativo} strokeWidth={1} />
            <text
              x={x(negativo) + (negativoADireita ? -6 : 6)}
              y={TOPO - 8}
              textAnchor={negativoADireita ? 'end' : 'start'}
              fontSize={11.5}
              fontWeight={600}
              fill={COR.texto}
            >
              Negativo a partir de {dayjs(serie[negativo].data).format('DD/MM')}
            </text>
          </g>
        )}
        <circle cx={xMenor} cy={yMenor} r={4.5} fill={serie[menor].saldo < 0 ? COR.negativo : COR.positivo} stroke="#fff" strokeWidth={2} />
        <text
          x={xMenor + (ancoraMenor === 'start' ? 8 : ancoraMenor === 'end' ? -8 : 0)}
          y={yMenor + (yMenor > TOPO + ALTURA_SALDO - 24 ? -12 : 20)}
          textAnchor={ancoraMenor}
          fontSize={11.5}
          fill={COR.texto}
          stroke="#fff"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {rotuloMenor}
        </text>

        {/* Eixo das datas, embaixo de cada painel. */}
        {[TOPO + ALTURA_SALDO, topoBarras + ALTURA_BARRAS].map((yEixo) =>
          marcasDatas(serie).map((m) => (
            <text key={`${yEixo}-${m.i}`} x={x(m.i) + 2} y={yEixo + 17} fontSize={11} fill={COR.textoFraco}>
              {m.rotulo}
            </text>
          )),
        )}

        {/* Painel das entradas e saídas. */}
        <text x={M.esquerda} y={topoBarras - 14} fontSize={12.5} fontWeight={600} fill={COR.texto}>
          Entradas e saídas por {NOME_NIVEL[nivel]}
        </text>
        {ticksBarras.map((t) => (
          <g key={`b${t}`}>
            <line x1={M.esquerda} x2={largura - M.direita} y1={yBarras(t)} y2={yBarras(t)} stroke={t === 0 ? COR.zero : COR.grade} strokeWidth={1} />
            <text x={M.esquerda - 8} y={yBarras(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={COR.textoFraco}>
              {rotuloEixo(Math.abs(t), compactoBarras)}
            </text>
          </g>
        ))}
        {periodos.map((p, k) => {
          const a = indiceDe.get(p.inicio)!;
          const b = indiceDe.get(p.fim)! + 1;
          const w = Math.max(2, Math.min(24, (x(b) - x(a)) * 0.6));
          const cx = (x(a) + x(b)) / 2;
          return (
            <g key={p.inicio} opacity={periodoDoFoco >= 0 && periodoDoFoco !== k ? 0.45 : 1}>
              {p.entradas > 0 && <path d={coluna(cx, w, yBarras(0) - 1, yBarras(p.entradas))} fill={COR.entrada} />}
              {p.saidas > 0 && <path d={coluna(cx, w, yBarras(0) + 1, yBarras(-p.saidas))} fill={COR.saida} />}
            </g>
          );
        })}

        {/* Linha vertical do foco, nos dois painéis. */}
        {dia && foco !== null && (
          <g pointerEvents="none">
            <line x1={xFoco} x2={xFoco} y1={TOPO} y2={TOPO + ALTURA_SALDO} stroke={COR.texto} strokeWidth={1} opacity={0.5} />
            <line x1={xFoco} x2={xFoco} y1={topoBarras} y2={topoBarras + ALTURA_BARRAS} stroke={COR.texto} strokeWidth={1} opacity={0.5} />
            {base && <circle cx={xFoco} cy={ySaldo(base[foco].saldo)} r={4} fill={COR.base} stroke="#fff" strokeWidth={2} />}
            <circle cx={xFoco} cy={ySaldo(dia.saldo)} r={4.5} fill={dia.saldo < 0 ? COR.negativo : COR.positivo} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <rect x={M.esquerda} y={TOPO} width={area} height={altura - TOPO - EIXO} fill="transparent" onPointerMove={mover} onPointerLeave={() => setFoco(null)} />
      </svg>

      {dia && foco !== null && (
        <Dica
          dia={dia}
          base={base ? base[foco] : null}
          periodo={periodoDoFoco >= 0 && nivel !== 'dia' ? periodos[periodoDoFoco] : null}
          nivel={nivel}
          x={xFoco}
          largura={largura}
        />
      )}
    </Box>
  );
}

/** Sinal de cada tipo de lançamento; o simulado já traz o sinal no valor. */
const SINAL = { RECEBER: 1, CONTRATO: 1, PAGAR: -1, RECORRENTE: -1, SIMULADO: 0 } as const;

/** O que acontece no dia apontado: o saldo em destaque, o que entra e sai, e os maiores lançamentos. */
function Dica({
  dia,
  base,
  periodo,
  nivel,
  x,
  largura,
}: {
  dia: DiaProjetado;
  base: DiaProjetado | null;
  periodo: Periodo | null;
  nivel: Nivel;
  x: number;
  largura: number;
}) {
  const lado = x > largura / 2 ? { right: largura - x + 14 } : { left: x + 14 };
  const maiores = dia.lancamentos.slice(0, 4);
  const chave = (cor: string) => <Box w={10} h={2} bg={cor} style={{ borderRadius: 1, flexShrink: 0 }} />;
  const valorComRotulo = (cor: string, valor: number, rotulo: string) => (
    <Group gap={6} wrap="nowrap">
      {chave(cor)}
      <Text size="xs">
        <b>{moeda(valor)}</b> <span style={{ color: 'var(--mantine-color-dimmed)' }}>{rotulo}</span>
      </Text>
    </Group>
  );
  return (
    <Box
      pos="absolute"
      top={8}
      {...lado}
      w={280}
      p="sm"
      bg="white"
      style={{ border: '1px solid var(--relda-borda)', borderRadius: 8, boxShadow: 'var(--mantine-shadow-md)', pointerEvents: 'none', zIndex: 2 }}
    >
      <Text size="xs" c="dimmed" tt="capitalize">
        {dayjs(dia.data).format('dddd, DD/MM/YYYY')}
      </Text>
      <Text fw={600} fz={17} c={dia.saldo < 0 ? 'red.8' : undefined}>
        {moeda(dia.saldo / 100)}
      </Text>
      <Text size="xs" c="dimmed">
        saldo no fim do dia
      </Text>
      {base && base.saldo !== dia.saldo && <Box mt={4}>{valorComRotulo(COR.base, base.saldo / 100, 'sem a simulação')}</Box>}
      {(dia.entradas > 0 || dia.saidas > 0) && (
        <Box mt={6}>
          {dia.entradas > 0 && valorComRotulo(COR.entrada, dia.entradas / 100, 'entram')}
          {dia.saidas > 0 && valorComRotulo(COR.saida, dia.saidas / 100, 'saem')}
          {maiores.map((l, i) => {
            const valor = SINAL[l.tipo] === 0 ? l.valor : SINAL[l.tipo] * l.valor;
            return (
              <Text key={i} size="xs" c="dimmed" lineClamp={1} mt={i === 0 ? 4 : 0}>
                {valor >= 0 ? '+' : '−'} {l.estimado ? '~' : ''}
                {moeda(Math.abs(valor))} · {l.descricao}
                {l.pessoa ? ` · ${l.pessoa}` : ''}
              </Text>
            );
          })}
          {dia.lancamentos.length > maiores.length && (
            <Text size="xs" c="dimmed">
              e mais {dia.lancamentos.length - maiores.length}
            </Text>
          )}
        </Box>
      )}
      {periodo && (
        <Text size="xs" c="dimmed" mt={6}>
          No {nivel === 'semana' ? 'período da semana' : 'mês'} ({dayjs(periodo.inicio).format('DD/MM')} a {dayjs(periodo.fim).format('DD/MM')}): entram{' '}
          {moeda(periodo.entradas / 100)} e saem {moeda(periodo.saidas / 100)}
        </Text>
      )}
    </Box>
  );
}
