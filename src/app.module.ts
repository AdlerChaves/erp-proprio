import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './config/database.config';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ContasReceberModule } from './modules/contas-receber/contas-receber.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...databaseOptions(), autoLoadEntities: true }),
    }),
    AuthModule,
    EmpresasModule,
    UsuariosModule,
    ClientesModule,
    ContasReceberModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
