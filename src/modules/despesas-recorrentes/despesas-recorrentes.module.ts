import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContasPagarModule } from '../contas-pagar/contas-pagar.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { AgendadorDespesas } from './agendador';
import { DespesaRecorrente } from './despesa-recorrente.entity';
import { DespesasRecorrentesController } from './despesas-recorrentes.controller';
import { DespesasRecorrentesService } from './despesas-recorrentes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DespesaRecorrente, ContaPagar]),
    AuditoriaModule,
    ContasPagarModule,
    FornecedoresModule,
    PlanoContasModule,
    CentrosCustoModule,
  ],
  controllers: [DespesasRecorrentesController],
  providers: [DespesasRecorrentesService, AgendadorDespesas],
})
export class DespesasRecorrentesModule {}
