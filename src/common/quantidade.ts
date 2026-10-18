/** Quantidades em milésimos inteiros (3 casas, como no banco), para somar sem erro de ponto flutuante. */
export const milesimos = (quantidade: number | string) => Math.round(Number(quantidade) * 1000);

export const quantidade = (milesimos: number) => milesimos / 1000;

/** Total de um item em centavos: quantidade × preço − desconto, arredondado ao centavo. */
export const totalItem = (qtdMilesimos: number, precoCentavos: number, descontoCentavos = 0) =>
  Math.round((qtdMilesimos * precoCentavos) / 1000) - descontoCentavos;
