/** Somas de dinheiro em centavos inteiros, para não acumular erro de ponto flutuante. */
export const centavos = (valor: number | string) => Math.round(Number(valor) * 100);

export const reais = (centavos: number) => centavos / 100;
