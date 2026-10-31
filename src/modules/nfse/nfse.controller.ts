import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { buscarMunicipios, buscarServicos, municipio } from './catalogos';
import { CancelarNotaServicoDto } from './dto/cancelar-nota.dto';
import { FiltroNotasServicoDto } from './dto/filtro-notas.dto';
import { GerarNotaServicoDto } from './dto/gerar-nota.dto';
import { RegistrarEmissaoDto } from './dto/registrar-emissao.dto';
import { NfseService } from './nfse.service';

const FISCAL = [Perfil.ADMIN, Perfil.FINANCEIRO];

@ApiTags('nfse')
@ApiBearerAuth()
@Controller()
export class NfseController {
  constructor(private readonly service: NfseService) {}

  /** Municípios do IBGE (tabela oficial da NFS-e), para escolher no endereço e no local da prestação. */
  @Get('nfse/municipios')
  municipios(@Query('busca') busca?: string, @Query('uf') uf?: string) {
    return buscarMunicipios(busca, uf);
  }

  @Get('nfse/municipios/:codigo')
  municipio(@Param('codigo') codigo: string) {
    return municipio(codigo) ?? null;
  }

  /** Lista nacional de serviços (código de tributação nacional de 6 dígitos). */
  @Get('nfse/servicos')
  servicos(@Query('busca') busca?: string) {
    return buscarServicos(busca);
  }

  @Get('notas-servico')
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroNotasServicoDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get('notas-servico/:id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  /** Arquivo XML da DPS. */
  @Get('notas-servico/:id/xml')
  async xml(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { nome, conteudo } = await this.service.xml(sessao.empresaId, id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(conteudo);
  }

  /** Arquivo XML da NFS-e emitida pelo ERP no Emissor Nacional. */
  @Get('notas-servico/:id/xml-nfse')
  async xmlNfse(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { nome, conteudo } = await this.service.xmlNfse(sessao.empresaId, id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(conteudo);
  }

  /** Arquivo XML do evento de cancelamento registrado no Emissor Nacional. */
  @Get('notas-servico/:id/xml-cancelamento')
  async xmlCancelamento(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { nome, conteudo } = await this.service.xmlCancelamento(sessao.empresaId, id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(conteudo);
  }

  /** DANFSe em PDF da NFS-e emitida pelo ERP. */
  @Get('notas-servico/:id/danfse')
  async danfse(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { nome, conteudo } = await this.service.danfse(sessao.empresaId, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nome}"` });
    return new StreamableFile(conteudo);
  }

  /** Gera a(s) DPS dos serviços de uma venda faturada. */
  @Post('vendas/:id/notas-servico')
  @Perfis(...FISCAL)
  gerar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: GerarNotaServicoDto) {
    return this.service.gerarParaVenda(sessao.empresaId, id, dto);
  }

  /** Assina a DPS com o certificado da empresa e emite a NFS-e no Emissor Nacional. */
  @Post('notas-servico/:id/transmissao')
  @Perfis(...FISCAL)
  @HttpCode(200)
  transmitir(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.transmitir(sessao.empresaId, id);
  }

  /** Informa o número de uma NFS-e emitida fora do ERP. */
  @Post('notas-servico/:id/emissao')
  @Perfis(...FISCAL)
  @HttpCode(200)
  registrarEmissao(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrarEmissaoDto) {
    return this.service.registrarEmissao(sessao.empresaId, id, dto);
  }

  /** Cancela a nota; a NFS-e emitida pelo ERP é cancelada no Emissor Nacional, por evento. */
  @Post('notas-servico/:id/cancelamento')
  @Perfis(...FISCAL)
  @HttpCode(200)
  cancelar(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelarNotaServicoDto) {
    return this.service.cancelar(sessao.empresaId, id, dto);
  }
}
