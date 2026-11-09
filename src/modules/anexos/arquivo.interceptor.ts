import { CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException, Type } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LIMITE_TAMANHO_ANEXO } from './anexos.service';

// O arquivo fica em memória (até 10 MB) e vai direto para o banco: nada é gravado em disco.
// Sem campos de texto: só o arquivo interessa, e campos extras iriam parar na auditoria.
const Upload: Type<NestInterceptor> = FileInterceptor('arquivo', {
  limits: { fileSize: LIMITE_TAMANHO_ANEXO, files: 1, fields: 0, parts: 1 },
});

/** Recebe um arquivo no campo "arquivo" (multipart) e troca a mensagem de tamanho excedido do multer. */
@Injectable()
export class ArquivoInterceptor implements NestInterceptor {
  private readonly upload = new Upload();

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    try {
      return await this.upload.intercept(ctx, next);
    } catch (erro) {
      if (erro instanceof PayloadTooLargeException) {
        throw new PayloadTooLargeException(`O arquivo deve ter até ${LIMITE_TAMANHO_ANEXO / 1024 / 1024} MB`);
      }
      throw erro;
    }
  }
}
