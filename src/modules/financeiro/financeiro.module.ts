import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { MovimentacoesModule } from '../movimentacoes/movimentacoes.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { Baixa } from './baixa.entity';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import { ProjecaoService } from './projecao.service';

/** Baixas de contas a receber e a pagar, e os relatórios financeiros (fluxo de caixa, projeção do caixa e DRE). */
@Module({
  imports: [TypeOrmModule.forFeature([Baixa]), MovimentacoesModule, PlanoContasModule, ContasBancariasModule, CentrosCustoModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService, ProjecaoService],
})
export class FinanceiroModule {}
