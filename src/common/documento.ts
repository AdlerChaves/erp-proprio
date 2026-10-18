/** Confere os dígitos verificadores de um CPF (11 dígitos) ou CNPJ (14 dígitos). */
export function documentoValido(documento: string) {
  const d = documento.replace(/\D/g, '');
  if (!/^(\d{11}|\d{14})$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const digito = (base: string, pesos: number[]) => {
    const resto = base.split('').reduce((s, n, i) => s + Number(n) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
    const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return digito(d.slice(0, 9), p1) === Number(d[9]) && digito(d.slice(0, 10), p2) === Number(d[10]);
  }
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return digito(d.slice(0, 12), p1) === Number(d[12]) && digito(d.slice(0, 13), p2) === Number(d[13]);
}
