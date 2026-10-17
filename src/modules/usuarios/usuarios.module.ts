import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuarioEmpresa } from './usuario-empresa.entity';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsuarioEmpresa])],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
