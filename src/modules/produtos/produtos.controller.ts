import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ImagemDto } from '../../common/imagem';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { CreateProdutoDto } from './dto/create-produto.dto';
import { FiltroProdutoDto } from './dto/filtro-produto.dto';
import { UpdateProdutoDto } from './dto/update-produto.dto';
import { ProdutosService } from './produtos.service';

@ApiTags('produtos')
@ApiBearerAuth()
@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao, @Query() filtro: FiltroProdutoDto) {
    return this.service.findAll(sessao.empresaId, filtro);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.VENDAS)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateProdutoDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.VENDAS)
  update(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProdutoDto,
  ) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  /** Foto opcional, que vai junto do item no orçamento em PDF. */
  @Get(':id/imagem')
  imagem(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.imagem(sessao.empresaId, id);
  }

  @Put(':id/imagem')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.VENDAS)
  definirImagem(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ImagemDto) {
    return this.service.definirImagem(sessao.empresaId, id, dto.imagem);
  }

  @Delete(':id/imagem')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO, Perfil.VENDAS)
  @HttpCode(204)
  removerImagem(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.removerImagem(sessao.empresaId, id);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }
}
