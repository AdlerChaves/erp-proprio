import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaController } from './auditoria.controller';
import { AuditoriaInterceptor } from './auditoria.interceptor';
import { AuditoriaService } from './auditoria.service';
import { RegistroAuditoria } from './registro-auditoria.entity';

/** Global para o AuthService registrar eventos de login sem criar dependência circular. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RegistroAuditoria])],
  controllers: [AuditoriaController],
  providers: [AuditoriaService, { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor }],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
