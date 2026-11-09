import { Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { contentDisposition } from '../../common/arquivo';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { AnexosService, ArquivoRecebido, OrigemAnexo } from './anexos.service';
import { ArquivoInterceptor } from './arquivo.interceptor';

/** Rotas de anexo, iguais para contas a pagar e a receber; cada subclasse fixa a origem e o caminho. */
// @Injectable: faz o TypeScript emitir os tipos do construtor, que as subclasses herdam para a injeção.
@Injectable()
abstract class AnexosController {
  protected abstract readonly origem: OrigemAnexo;

  constructor(protected readonly anexos: AnexosService) {}

  @Get()
  listar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.anexos.listar(sessao.empresaId, this.origem, id);
  }

  /** Boleto, nota fiscal ou comprovante: PDF, PNG, JPEG ou XML de até 10 MB, no campo "arquivo". */
  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  @UseInterceptors(ArquivoInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { arquivo: { type: 'string', format: 'binary' } }, required: ['arquivo'] } })
  enviar(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
  ) {
    return this.anexos.enviar(sessao.empresaId, sessao.usuarioId, this.origem, id, arquivo);
  }

  /** Sempre como download (attachment): o navegador nunca interpreta o arquivo na origem do ERP. */
  @Get(':anexoId')
  async baixar(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const anexo = await this.anexos.baixar(sessao.empresaId, this.origem, id, anexoId);
    res.set({
      'Content-Type': anexo.tipo,
      'Content-Disposition': contentDisposition(anexo.nome),
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(anexo.conteudo);
  }

  @Delete(':anexoId')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  excluir(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('anexoId', ParseUUIDPipe) anexoId: string,
  ) {
    return this.anexos.excluir(sessao.empresaId, this.origem, id, anexoId);
  }
}

@ApiTags('contas-pagar')
@ApiBearerAuth()
@Controller('contas-pagar/:id/anexos')
export class AnexosContaPagarController extends AnexosController {
  protected readonly origem = 'pagar';
}

@ApiTags('contas-receber')
@ApiBearerAuth()
@Controller('contas-receber/:id/anexos')
export class AnexosContaReceberController extends AnexosController {
  protected readonly origem = 'receber';
}
