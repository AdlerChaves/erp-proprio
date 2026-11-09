import { ActionIcon, Button, FileButton, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { IconDownload, IconFileText, IconPaperclip, IconPhoto, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { abrirArquivo, api, baixarArquivo, enviarArquivo } from '../api/cliente';
import type { Anexo } from '../api/tipos';
import { useSessao } from '../sessao/sessao';
import { podeVisualizar, problemasNoLote, tamanhoArquivo, TIPOS_ANEXO } from '../util/arquivo';
import { dataHora } from '../util/formato';
import { avisarErro, avisarSucesso, Confirmacao, ErroCarregamento } from './comum';

/**
 * Boletos, notas fiscais e comprovantes de uma conta. A lista fica sob a chave da rota-base
 * (ex.: /contas-pagar), então invalidar as contas também atualiza os anexos.
 */
export function Anexos({ rotaBase, contaId }: { rotaBase: string; contaId: string }) {
  const { pode } = useSessao();
  const escrever = pode('escreverFinanceiro');
  const queryClient = useQueryClient();
  const rota = `${rotaBase}/${contaId}/anexos`;
  const [excluindo, setExcluindo] = useState<Anexo | null>(null);

  const lista = useQuery({ queryKey: [rotaBase, contaId, 'anexos'], queryFn: () => api.get<Anexo[]>(rota) });
  // A listagem de contas mostra a quantidade de anexos: atualiza as duas.
  const atualizar = () => queryClient.invalidateQueries({ queryKey: [rotaBase] });

  // Limpa a seleção do <input type=file>: sem isso, escolher de novo o mesmo arquivo não dispara nada.
  const limparSelecao = useRef<() => void>(null);

  const enviar = useMutation({
    mutationFn: async (arquivos: File[]) => {
      const problemas = problemasNoLote(arquivos);
      if (problemas.length) throw new Error(`Nada foi enviado. ${problemas.join('; ')}`);
      let enviados = 0;
      for (const arquivo of arquivos) {
        try {
          await enviarArquivo<Anexo>(rota, arquivo);
        } catch (erro) {
          const antes = enviados ? `${enviados} de ${arquivos.length} enviado(s). ` : '';
          throw new Error(`${antes}${arquivo.name}: ${(erro as Error).message}`);
        }
        enviados++;
      }
      return enviados;
    },
    // Num envio de vários, os que já subiram ficam: atualiza a lista mesmo se um falhar no meio.
    onSettled: () => {
      limparSelecao.current?.();
      atualizar();
    },
    onSuccess: (n) => avisarSucesso(n === 1 ? 'Arquivo anexado' : `${n} arquivos anexados`),
    onError: avisarErro,
  });

  const excluir = useMutation({
    mutationFn: (anexo: Anexo) => api.delete(`${rota}/${anexo.id}`),
    onSuccess: () => {
      atualizar();
      avisarSucesso('Anexo excluído');
      setExcluindo(null);
    },
    onError: (erro) => {
      avisarErro(erro);
      setExcluindo(null);
    },
  });

  const baixar = (anexo: Anexo) => baixarArquivo(`${rota}/${anexo.id}`, anexo.nome).catch(avisarErro);
  const abrir = (anexo: Anexo) => (podeVisualizar(anexo.tipo) ? abrirArquivo(`${rota}/${anexo.id}`).catch(avisarErro) : baixar(anexo));

  return (
    <Stack gap="xs">
      {lista.isLoading ? (
        <Loader size="sm" />
      ) : lista.isError ? (
        <ErroCarregamento erro={lista.error} />
      ) : lista.data!.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nenhum arquivo anexado.
        </Text>
      ) : (
        lista.data!.map((anexo) => {
          const Icone = anexo.tipo.startsWith('image/') ? IconPhoto : IconFileText;
          return (
            <Group key={anexo.id} justify="space-between" wrap="nowrap" gap="xs">
              <Group wrap="nowrap" gap="xs" style={{ minWidth: 0 }}>
                <Icone size={18} style={{ flexShrink: 0 }} color="var(--mantine-color-dimmed)" />
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Text
                    size="sm"
                    truncate
                    td="underline"
                    c="teal.8"
                    style={{ cursor: 'pointer' }}
                    title={podeVisualizar(anexo.tipo) ? `Abrir ${anexo.nome}` : `Baixar ${anexo.nome}`}
                    onClick={() => abrir(anexo)}
                  >
                    {anexo.nome}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {tamanhoArquivo(anexo.tamanho)} · {dataHora(anexo.criadoEm)}
                    {anexo.enviadoPor && ` · ${anexo.enviadoPor.nome}`}
                  </Text>
                </Stack>
              </Group>
              <Group gap={4} wrap="nowrap">
                <Tooltip label="Baixar">
                  <ActionIcon variant="subtle" color="gray" aria-label={`Baixar ${anexo.nome}`} onClick={() => baixar(anexo)}>
                    <IconDownload size={16} />
                  </ActionIcon>
                </Tooltip>
                {escrever && (
                  <Tooltip label="Excluir">
                    <ActionIcon variant="subtle" color="red" aria-label={`Excluir ${anexo.nome}`} onClick={() => setExcluindo(anexo)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
            </Group>
          );
        })
      )}
      {escrever && (
        <>
          <FileButton
            onChange={(arquivos) => arquivos.length > 0 && enviar.mutate(arquivos)}
            accept={TIPOS_ANEXO}
            multiple
            resetRef={limparSelecao}
          >
            {(props) => (
              <Button
                {...props}
                variant="light"
                size="xs"
                leftSection={<IconPaperclip size={14} />}
                loading={enviar.isPending}
                style={{ alignSelf: 'flex-start' }}
              >
                Anexar arquivo
              </Button>
            )}
          </FileButton>
          <Text size="xs" c="dimmed">
            Boleto, nota fiscal ou comprovante: PDF, PNG, JPEG ou XML, até 10 MB.
          </Text>
        </>
      )}
      <Confirmacao
        aberta={excluindo !== null}
        titulo="Excluir anexo"
        mensagem={`O arquivo ${excluindo?.nome ?? ''} será excluído. Isso não pode ser desfeito.`}
        rotuloConfirmar="Excluir"
        perigosa
        carregando={excluir.isPending}
        aoConfirmar={() => excluindo && excluir.mutate(excluindo)}
        aoFechar={() => setExcluindo(null)}
      />
    </Stack>
  );
}
