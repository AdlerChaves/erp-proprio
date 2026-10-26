import { BadRequestException } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';

export class ImagemDto {
  /** data:image/png;base64,... ou data:image/jpeg;base64,... (até 400 KB). */
  @IsString()
  @MaxLength(560_000)
  imagem: string;
}

/** Aceita só PNG ou JPEG de verdade (confere a assinatura do arquivo), até 400 KB. `nome` vai nas mensagens ("o logo"). */
export function validarImagem(imagem: string, nome: string) {
  const partes = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imagem);
  if (!partes) throw new BadRequestException(`Envie ${nome} em PNG ou JPEG`);
  const bytes = Buffer.from(partes[2], 'base64');
  if (bytes.length > 400 * 1024) throw new BadRequestException(`${nome[0].toUpperCase()}${nome.slice(1)} deve ter até 400 KB`);
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((partes[1] === 'png' && !png) || (partes[1] === 'jpeg' && !jpeg)) {
    throw new BadRequestException('O arquivo não é uma imagem PNG ou JPEG válida');
  }
}
