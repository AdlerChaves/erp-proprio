import { ValueTransformer } from 'typeorm';

// O driver pg devolve NUMERIC como string; converte para number na leitura.
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => (value == null ? value : value.toFixed(2)),
  from: (value?: string | null) => (value == null ? value : Number(value)),
};

/** Para quantidades NUMERIC(14,3). */
export const quantidadeTransformer: ValueTransformer = {
  to: (value?: number | null) => (value == null ? value : value.toFixed(3)),
  from: (value?: string | null) => (value == null ? value : Number(value)),
};
