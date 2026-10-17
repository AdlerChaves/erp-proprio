/** Situação de uma conta a receber ou a pagar, derivada das baixas registradas. */
export enum StatusConta {
  ABERTA = 'ABERTA',
  /** Tem baixas, mas ainda há saldo em aberto. */
  PARCIAL = 'PARCIAL',
  PAGA = 'PAGA',
  CANCELADA = 'CANCELADA',
}
