import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ClientesModule } from '../clientes/clientes.module';
import { NfseModule } from '../nfse/nfse.module';
import { NotaServico } from '../nfse/nota-servico.entity';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { Produto } from '../produtos/produto.entity';
import { Venda } from '../vendas/venda.entity';
import { VendasModule } from '../vendas/vendas.module';
import { AgendadorContratos } from './agendador';
import { Contrato, GeracaoContrato, ItemContrato } from './contrato.entity';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
import { GeracaoContratosService } from './geracao.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contrato, ItemContrato, GeracaoContrato, Produto, Venda, NotaServico]),
    AuditoriaModule,
    ClientesModule,
    PlanoContasModule,
    CentrosCustoModule,
    VendasModule,
    NfseModule,
  ],
  controllers: [ContratosController],
  providers: [ContratosService, GeracaoContratosService, AgendadorContratos],
})
export class ContratosModule {}
