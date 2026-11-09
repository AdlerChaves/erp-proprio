import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnexosModule } from '../anexos/anexos.module';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { MovimentacoesModule } from '../movimentacoes/movimentacoes.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { ContaPagar } from './conta-pagar.entity';
import { ContasPagarController } from './contas-pagar.controller';
import { ContasPagarService } from './contas-pagar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContaPagar]),
    FornecedoresModule,
    PlanoContasModule,
    CentrosCustoModule,
    ContasBancariasModule,
    MovimentacoesModule,
    AnexosModule,
  ],
  controllers: [ContasPagarController],
  providers: [ContasPagarService],
  exports: [ContasPagarService],
})
export class ContasPagarModule {}
