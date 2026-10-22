import { ActionIcon, Loader, TextInput, type TextInputProps, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { api } from '../api/cliente';
import type { DadosCep } from '../api/tipos';
import { digitos } from '../util/formato';
import { avisarErro } from './comum';

/** Campos de endereço que o CEP preenche. */
interface EnderecoDoForm {
  logradouro: string;
  bairro: string;
  codigoMunicipio: string | null;
}

/** O que o CEP traz substitui; o que ele não traz (CEP geral de município) fica como estava. */
export function enderecoDoCep(d: DadosCep, atual: EnderecoDoForm): EnderecoDoForm {
  return {
    logradouro: d.logradouro || atual.logradouro,
    bairro: d.bairro || atual.bairro,
    codigoMunicipio: d.codigoMunicipio ?? atual.codigoMunicipio,
  };
}

/**
 * Campo de CEP que busca o endereço sozinho ao completar os 8 dígitos (uma vez por CEP) ou pelo botão.
 * Recebe as props do formulário (`form.getInputProps('cep')`) e entrega o resultado em `aoEncontrar`.
 */
export function CampoCep({ aoEncontrar, onChange, value, disabled, ...props }: TextInputProps & { aoEncontrar: (d: DadosCep) => void }) {
  const ultimo = useRef<string | null>(null);
  const busca = useMutation({
    mutationFn: (cep: string) => api.get<DadosCep>(`/cep/${cep}`),
    onSuccess: (d) => {
      aoEncontrar(d);
      if (!d.logradouro && d.municipio) {
        notifications.show({ color: 'blue', message: `CEP geral de ${d.municipio.nome}: preencha a rua e o bairro` });
      }
    },
    onError: avisarErro,
  });
  const cep = digitos(String(value ?? ''));
  const buscar = (valor: string) => {
    ultimo.current = valor;
    busca.mutate(valor);
  };

  return (
    <TextInput
      placeholder="00000-000"
      {...props}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange?.(e);
        const novo = digitos(e.currentTarget.value);
        if (novo.length === 8 && novo !== ultimo.current) buscar(novo);
      }}
      rightSection={
        disabled ? null : busca.isPending ? (
          <Loader size="xs" />
        ) : (
          <Tooltip label={cep.length === 8 ? 'Buscar endereço pelo CEP' : 'Digite os 8 dígitos do CEP'}>
            <ActionIcon variant="subtle" aria-label="Buscar endereço pelo CEP" disabled={cep.length !== 8} onClick={() => buscar(cep)}>
              <IconSearch size={16} />
            </ActionIcon>
          </Tooltip>
        )
      }
    />
  );
}
