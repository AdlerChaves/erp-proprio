import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovimentacoesModule } from '../movimentacoes/movimentacoes.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { Baixa } from './baixa.entity';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';

/** Baixas de contas a receber e a pagar, e os relatórios financeiros (fluxo de caixa e DRE). */
@Module({
  imports: [TypeOrmModule.forFeature([Baixa]), MovimentacoesModule, PlanoContasModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class FinanceiroModule {}
