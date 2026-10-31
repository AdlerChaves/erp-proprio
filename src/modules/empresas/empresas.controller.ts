import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Perfis, SessaoAtual } from '../auth/auth.decorators';
import { Sessao } from '../auth/sessao';
import { ImagemDto } from '../../common/imagem';
import { Perfil } from '../usuarios/perfil.enum';
import { CertificadoDto } from './dto/certificado.dto';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EmpresasService } from './empresas.service';

@ApiTags('empresas')
@ApiBearerAuth()
@Controller('empresas')
export class EmpresasController {
  constructor(private readonly service: EmpresasService) {}

  @Get('atual')
  atual(@SessaoAtual() sessao: Sessao) {
    return this.service.findOne(sessao.empresaId);
  }

  @Patch('atual')
  @Perfis(Perfil.ADMIN)
  update(@SessaoAtual() sessao: Sessao, @Body() dto: UpdateEmpresaDto) {
    return this.service.update(sessao.empresaId, dto);
  }

  /** Logo que vai no cabeçalho dos orçamentos e pedidos em PDF. */
  @Get('atual/logo')
  logo(@SessaoAtual() sessao: Sessao) {
    return this.service.logo(sessao.empresaId);
  }

  @Put('atual/logo')
  @Perfis(Perfil.ADMIN)
  definirLogo(@SessaoAtual() sessao: Sessao, @Body() dto: ImagemDto) {
    return this.service.definirLogo(sessao.empresaId, dto.imagem);
  }

  @Delete('atual/logo')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  removerLogo(@SessaoAtual() sessao: Sessao) {
    return this.service.removerLogo(sessao.empresaId);
  }

  /** Certificado digital A1 para emitir a NFS-e no Emissor Nacional. Só o titular e a validade voltam. */
  @Put('atual/certificado')
  @Perfis(Perfil.ADMIN)
  definirCertificado(@SessaoAtual() sessao: Sessao, @Body() dto: CertificadoDto) {
    return this.service.definirCertificado(sessao.empresaId, dto);
  }

  @Delete('atual/certificado')
  @Perfis(Perfil.ADMIN)
  @HttpCode(204)
  removerCertificado(@SessaoAtual() sessao: Sessao) {
    return this.service.removerCertificado(sessao.empresaId);
  }

  /** Cria outra empresa para o usuário logado; use POST /auth/trocar-empresa para acessá-la. */
  @Post()
  create(@SessaoAtual() sessao: Sessao, @Body() dto: CreateEmpresaDto) {
    return this.service.criarParaUsuario(sessao.usuarioId, dto);
  }
}
