import { Button, FileButton, Group, Image, NumberInput, Paper, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPhoto, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '../api/cliente';
import type { ConfigProposta, Empresa } from '../api/tipos';
import { avisarErro, avisarSucesso } from '../componentes/comum';
import { lerComoDataUrl, TAMANHO_MAXIMO_IMAGEM } from '../util/arquivo';
import { moeda } from '../util/formato';

/** Parcela no cartão pela tabela Price, igual ao PDF: sem juros até `semJuros` vezes. */
export function parcelaCartao(total: number, parcelas: number, jurosMensal: number, semJuros: number) {
  const centavos = Math.round(total * 100);
  const i = jurosMensal / 100;
  if (parcelas <= semJuros || i === 0) return Math.round(centavos / parcelas) / 100;
  return Math.round((centavos * i) / (1 - (1 + i) ** -parcelas)) / 100;
}

function Logo({ podeEditar }: { podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const limpar = useRef<() => void>(null);
  const logo = useQuery({ queryKey: ['/empresas/atual/logo'], queryFn: () => api.get<{ logo: string | null }>('/empresas/atual/logo') });
  const atualizar = (dados: { logo: string | null }) => queryClient.setQueryData(['/empresas/atual/logo'], dados);

  const enviar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (!['image/png', 'image/jpeg'].includes(arquivo.type)) throw new Error('Use uma imagem PNG ou JPG');
      if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) throw new Error('O logo deve ter até 400 KB; reduza a imagem e tente de novo');
      return api.put<{ logo: string }>('/empresas/atual/logo', { imagem: await lerComoDataUrl(arquivo) });
    },
    onSuccess: (dados) => {
      atualizar(dados);
      avisarSucesso('Logo salvo: já aparece nos próximos PDFs');
    },
    onError: avisarErro,
    onSettled: () => limpar.current?.(),
  });
  const remover = useMutation({
    mutationFn: () => api.delete('/empresas/atual/logo'),
    onSuccess: () => {
      atualizar({ logo: null });
      avisarSucesso('Logo removido');
    },
    onError: avisarErro,
  });

  return (
    <Group align="center" gap="md">
      <Paper withBorder w={200} h={80} p={6} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {logo.data?.logo ? (
          <Image src={logo.data.logo} alt="Logo da empresa" fit="contain" h="100%" w="100%" />
        ) : (
          <Text size="xs" c="dimmed" ta="center">
            Sem logo: o nome da empresa vai no lugar
          </Text>
        )}
      </Paper>
      {podeEditar && (
        <Stack gap={6}>
          <Group gap="xs">
            <FileButton resetRef={limpar} onChange={(arquivo) => arquivo && enviar.mutate(arquivo)} accept="image/png,image/jpeg">
              {(props) => (
                <Button {...props} size="xs" variant="light" leftSection={<IconPhoto size={16} />} loading={enviar.isPending}>
                  {logo.data?.logo ? 'Trocar logo' : 'Enviar logo'}
                </Button>
              )}
            </FileButton>
            {logo.data?.logo && (
              <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={16} />} loading={remover.isPending} onClick={() => remover.mutate()}>
                Remover
              </Button>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            PNG ou JPG, até 400 KB. Prefira uma imagem larga, com fundo transparente ou branco.
          </Text>
        </Stack>
      )}
    </Group>
  );
}

/** Logo, destaques, validade, prazos e parcelamento no cartão dos orçamentos em PDF. */
export function FormProposta({ empresa, podeEditar }: { empresa: Empresa; podeEditar: boolean }) {
  const queryClient = useQueryClient();
  const valoresDe = (p: ConfigProposta) => ({
    destaques: [0, 1, 2, 3].map((i) => p.destaques[i] ?? ''),
    validadeDias: (p.validadeDias ?? '') as number | '',
    prazoEntrega: p.prazoEntrega ?? '',
    garantia: p.garantia ?? '',
    condicoes: p.condicoes ?? '',
    simularCartao: p.simularCartao,
    jurosCartao: p.jurosCartao as number | '',
    parcelasCartao: p.parcelasCartao as number | '',
    parcelasSemJuros: p.parcelasSemJuros as number | '',
  });
  const form = useForm({
    initialValues: valoresDe(empresa.proposta),
    validate: {
      validadeDias: (v) => (v === '' || (Number.isInteger(v) && v >= 1 && v <= 365) ? null : 'De 1 a 365 dias, ou em branco'),
      jurosCartao: (v) => (v !== '' && v >= 0 && v <= 15 ? null : 'De 0 a 15% ao mês'),
      parcelasCartao: (v) => (v !== '' && Number.isInteger(v) && v >= 1 && v <= 24 ? null : 'De 1 a 24'),
      parcelasSemJuros: (v, c) =>
        v !== '' && Number.isInteger(v) && v >= 1 && (c.parcelasCartao === '' || v <= c.parcelasCartao) ? null : 'De 1 até o máximo de parcelas',
    },
  });
  const salvar = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.patch<Empresa>('/empresas/atual', {
        proposta: {
          destaques: v.destaques.map((d) => d.trim()).filter(Boolean),
          validadeDias: v.validadeDias === '' ? null : v.validadeDias,
          prazoEntrega: v.prazoEntrega.trim() || null,
          garantia: v.garantia.trim() || null,
          condicoes: v.condicoes.trim() || null,
          simularCartao: v.simularCartao,
          jurosCartao: Number(v.jurosCartao),
          parcelasCartao: Number(v.parcelasCartao),
          parcelasSemJuros: Number(v.parcelasSemJuros),
        } satisfies ConfigProposta,
      }),
    onSuccess: (atualizada) => {
      queryClient.setQueryData(['/empresas/atual'], atualizada);
      form.resetDirty(valoresDe(atualizada.proposta));
      avisarSucesso('Configuração do orçamento salva');
    },
    onError: avisarErro,
  });

  const v = form.values;
  const exemplo =
    v.simularCartao && v.jurosCartao !== '' && v.parcelasCartao !== '' && v.parcelasSemJuros !== '' && v.parcelasSemJuros <= v.parcelasCartao
      ? parcelaCartao(1000, v.parcelasCartao, v.jurosCartao, v.parcelasSemJuros)
      : null;

  return (
    <Stack>
      <Logo podeEditar={podeEditar} />
      <form onSubmit={form.onSubmit((valores) => salvar.mutate(valores))}>
        <Stack>
          <div>
            <Text size="sm" fw={500}>
              Destaques
            </Text>
            <Text size="xs" c="dimmed" mb={6}>
              Até 4 frases curtas numa faixa abaixo do cabeçalho, como "Garantia de 12 meses" ou "Instalação inclusa"
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {[0, 1, 2, 3].map((i) => (
                <TextInput key={i} aria-label={`Destaque ${i + 1}`} placeholder={`Destaque ${i + 1}`} maxLength={45} disabled={!podeEditar} {...form.getInputProps(`destaques.${i}`)} />
              ))}
            </SimpleGrid>
          </div>
          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <NumberInput
              label="Validade do orçamento (dias)"
              description="Em branco, o PDF não mostra validade"
              allowDecimal={false}
              allowNegative={false}
              min={1}
              max={365}
              disabled={!podeEditar}
              {...form.getInputProps('validadeDias')}
            />
            <TextInput label="Previsão de entrega" placeholder="Ex.: 5 a 10 dias úteis" maxLength={120} disabled={!podeEditar} {...form.getInputProps('prazoEntrega')} />
            <TextInput label="Garantia" placeholder="Ex.: 12 meses" maxLength={120} disabled={!podeEditar} {...form.getInputProps('garantia')} />
          </SimpleGrid>
          <Textarea
            label="Condições comerciais"
            placeholder="Ex.: Instalação inclusa. Material conforme especificado acima."
            autosize
            minRows={2}
            maxLength={1000}
            disabled={!podeEditar}
            {...form.getInputProps('condicoes')}
          />
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Switch
                label="Mostrar no orçamento a tabela de parcelamento no cartão"
                description="À vista no Pix ou boleto, e cada número de parcelas com o valor e o total"
                disabled={!podeEditar}
                {...form.getInputProps('simularCartao', { type: 'checkbox' })}
              />
              {v.simularCartao && (
                <>
                  <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <NumberInput
                      label="Juros ao mês (%)"
                      description="Juros compostos (tabela Price)"
                      decimalScale={2}
                      decimalSeparator=","
                      allowNegative={false}
                      suffix=" %"
                      min={0}
                      max={15}
                      disabled={!podeEditar}
                      {...form.getInputProps('jurosCartao')}
                    />
                    <NumberInput label="Máximo de parcelas" allowDecimal={false} allowNegative={false} min={1} max={24} disabled={!podeEditar} {...form.getInputProps('parcelasCartao')} />
                    <NumberInput
                      label="Parcelas sem juros"
                      description="1 = só à vista no cartão"
                      allowDecimal={false}
                      allowNegative={false}
                      min={1}
                      max={24}
                      disabled={!podeEditar}
                      {...form.getInputProps('parcelasSemJuros')}
                    />
                  </SimpleGrid>
                  {exemplo !== null && v.parcelasCartao !== '' && (
                    <Text size="xs" c="dimmed">
                      Exemplo: {moeda(1000)} em {v.parcelasCartao}x fica {v.parcelasCartao}x de {moeda(exemplo)} (total de {moeda(exemplo * v.parcelasCartao)}).
                    </Text>
                  )}
                </>
              )}
            </Stack>
          </Paper>
          {podeEditar && (
            <Group justify="flex-end">
              <Button type="submit" loading={salvar.isPending} disabled={!form.isDirty()}>
                Salvar
              </Button>
            </Group>
          )}
        </Stack>
      </form>
    </Stack>
  );
}
