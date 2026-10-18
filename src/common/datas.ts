export const FUSO = process.env.APP_TIMEZONE ?? 'America/Sao_Paulo';

/**
 * Data de hoje (AAAA-MM-DD) no fuso da empresa, e não em UTC:
 * às 22h em Brasília, em UTC já é o dia seguinte.
 */
export const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
