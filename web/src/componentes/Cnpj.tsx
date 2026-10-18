import { ActionIcon, Alert, Loader, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCloudDownload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '../api/cliente';
import type { DadosCnpj } from '../api/tipos';
import { digitos, documentoValido } from '../util/formato';
import { avisarErro } from './comum';

/** CNPJ completo e com dígitos verificadores corretos: só esses vão para a consulta. */
export const cnpjConsultavel = (valor: string) => digitos(valor).length === 14 && documentoValido(valor);

/**
 * Consulta os dados públicos do CNPJ (Receita Federal, pela nossa API) e entrega o resultado a quem chamou.
 * `automatico` consulta sozinho quando o CNPJ fica completo, uma vez por número.
 */
export function useBuscaCnpj(aoEncontrar: (dados: DadosCnpj) => void) {
  const ultimo = useRef<string | null>(null);
  const busca = useMutation({
    mutationFn: (cnpj: string) => api.get<DadosCnpj>(`/cnpj/${digitos(cnpj)}`),
    onSuccess: aoEncontrar,
    onError: avisarErro,
  });
  const buscar = (cnpj: string) => {
    ultimo.current = digitos(cnpj);
    busca.mutate(cnpj);
  };
  const automatico = (cnpj: string) => {
    if (cnpjConsultavel(cnpj) && digitos(cnpj) !== ultimo.current) buscar(cnpj);
  };
  return { buscar, automatico, buscando: busca.isPending, dados: busca.data ?? null, limpar: busca.reset };
}

/** Botão dentro do campo de CNPJ. */
export function BotaoBuscarCnpj({ cnpj, buscando, aoClicar }: { cnpj: string; buscando: boolean; aoClicar: () => void }) {
  if (buscando) return <Loader size="xs" />;
  const pronto = cnpjConsultavel(cnpj);
  return (
    <Tooltip label={pronto ? 'Buscar dados na Receita Federal' : 'Digite um CNPJ completo e válido'}>
      <ActionIcon variant="subtle" aria-label="Buscar dados do CNPJ" disabled={!pronto} onClick={aoClicar}>
        <IconCloudDownload size={18} />
      </ActionIcon>
    </Tooltip>
  );
}

/** De onde vieram os dados e, se a empresa não estiver ativa, o aviso. */
export function ResumoCnpj({ dados, propria = false }: { dados: DadosCnpj; propria?: boolean }) {
  return (
    <>
      {!dados.ativa && (
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} p="xs">
          {propria ? (
            <>
              Na Receita Federal, o CNPJ desta empresa está <b>{dados.situacao}</b>. Notas fiscais emitidas com ele serão recusadas.
            </>
          ) : (
            <>
              Na Receita Federal, este CNPJ está <b>{dados.situacao}</b>. Confira antes de vender para ele: notas fiscais para empresas
              baixadas ou inaptas podem ser recusadas.
            </>
          )}
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        Dados da Receita Federal via {dados.fonte}
        {dados.nomeFantasia && ` · nome fantasia: ${dados.nomeFantasia}`}
        {dados.ativa && ' · situação: ativa'}. A base pública é atualizada uma vez por mês; confira antes de salvar.
      </Text>
    </>
  );
}
