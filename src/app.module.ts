import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './config/database.config';
import { HealthController } from './health/health.controller';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartoesModule } from './modules/cartoes/cartoes.module';
import { CentrosCustoModule } from './modules/centros-custo/centros-custo.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ComprasModule } from './modules/compras/compras.module';
import { ConsultaCnpjModule } from './modules/consulta-cnpj/consulta-cnpj.module';
import { ContasBancariasModule } from './modules/contas-bancarias/contas-bancarias.module';
import { ContasPagarModule } from './modules/contas-pagar/contas-pagar.module';
import { ContasReceberModule } from './modules/contas-receber/contas-receber.module';
import { EmpresasModule } from './modules/empresas/empresas.module';
import { EstoqueModule } from './modules/estoque/estoque.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { FornecedoresModule } from './modules/fornecedores/fornecedores.module';
import { MovimentacoesModule } from './modules/movimentacoes/movimentacoes.module';
import { NfseModule } from './modules/nfse/nfse.module';
import { PlanoContasModule } from './modules/plano-contas/plano-contas.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { VendasModule } from './modules/vendas/vendas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({ ...databaseOptions(), autoLoadEntities: true }),
    }),
    // Limite geral por IP (THROTTLE_LIMITE por minuto, padrão 300); login e cadastro têm limite próprio.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: () => Number(process.env.THROTTLE_LIMITE ?? 300) }]),
    AuditoriaModule,
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
    FinanceiroModule,
    EstoqueModule,
    VendasModule,
    ComprasModule,
    NfseModule,
    ConsultaCnpjModule,
    CartoesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
