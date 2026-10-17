import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './config/database.config';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { CentrosCustoModule } from './modules/centros-custo/centros-custo.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ContasBancariasModule } from './modules/contas-bancarias/contas-bancarias.module';
import { ContasPagarModule } from './modules/contas-pagar/contas-pagar.module';
import { ContasReceberModule } from './modules/contas-receber/contas-receber.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { FornecedoresModule } from './modules/fornecedores/fornecedores.module';
import { MovimentacoesModule } from './modules/movimentacoes/movimentacoes.module';
import { PlanoContasModule } from './modules/plano-contas/plano-contas.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
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
    FornecedoresModule,
    ProdutosModule,
    PlanoContasModule,
    CentrosCustoModule,
    ContasBancariasModule,
    ContasReceberModule,
    ContasPagarModule,
    MovimentacoesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
