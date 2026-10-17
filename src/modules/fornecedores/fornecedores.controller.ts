import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { Perfil } from '../usuarios/perfil.enum';
import { FornecedoresService } from './fornecedores.service';
import { CreateFornecedorDto } from './dto/create-fornecedor.dto';
import { UpdateFornecedorDto } from './dto/update-fornecedor.dto';

@ApiTags('fornecedores')
@ApiBearerAuth()
@Controller('fornecedores')
export class FornecedoresController {
  constructor(private readonly service: FornecedoresService) {}

  @Get()
  findAll(@SessaoAtual() sessao: Sessao) {
    return this.service.findAll(sessao.empresaId);
  }

  @Get(':id')
  findOne(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(sessao.empresaId, id);
  }

  @Post()
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateFornecedorDto) {
    return this.service.create(sessao.empresaId, dto);
  }

  @Patch(':id')
  @Perfis(Perfil.ADMIN, Perfil.FINANCEIRO)
  update(
    @SessaoAtual() sessao: Sessao,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFornecedorDto,
  ) {
    return this.service.update(sessao.empresaId, id, dto);
  }

  @Delete(':id')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  remove(@SessaoAtual() sessao: Sessao, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(sessao.empresaId, id);
  }
}
