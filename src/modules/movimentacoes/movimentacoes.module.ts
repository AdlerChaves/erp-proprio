import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { MovimentacaoBancaria } from './movimentacao-bancaria.entity';
import { MovimentacoesController } from './movimentacoes.controller';
import { MovimentacoesService } from './movimentacoes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MovimentacaoBancaria]),
    ContasBancariasModule,
    PlanoContasModule,
    CentrosCustoModule,
  ],
  controllers: [MovimentacoesController],
  providers: [MovimentacoesService],
  exports: [MovimentacoesService],
})
export class MovimentacoesModule {}
