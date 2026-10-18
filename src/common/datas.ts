export const FUSO = process.env.APP_TIMEZONE ?? 'America/Sao_Paulo';

/**
 * Data de hoje (AAAA-MM-DD) no fuso da empresa, e não em UTC:
 * às 22h em Brasília, em UTC já é o dia seguinte.
 */
export const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());

/**
 * Data e hora no fuso da empresa com o deslocamento explícito, como a NFS-e pede (dhEmi):
 * 2026-10-17T21:05:09-03:00.
 */
export function dataHoraComFuso(instante = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  );
  // "GMT-03:00"; em UTC o Intl escreve só "GMT".
  const deslocamento = partes.timeZoneName === 'GMT' ? '+00:00' : partes.timeZoneName.replace('GMT', '');
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${deslocamento}`;
}
