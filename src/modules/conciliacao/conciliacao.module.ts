import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { ContasPagarModule } from '../contas-pagar/contas-pagar.module';
import { ContasReceberModule } from '../contas-receber/contas-receber.module';
import { MovimentacaoBancaria } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesModule } from '../movimentacoes/movimentacoes.module';
import { ConciliacaoController } from './conciliacao.controller';
import { ConciliacaoService } from './conciliacao.service';
import { ImportacaoExtrato } from './importacao-extrato.entity';
import { LinhaExtrato } from './linha-extrato.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([LinhaExtrato, ImportacaoExtrato, MovimentacaoBancaria]),
    ContasBancariasModule,
    MovimentacoesModule,
    ContasReceberModule,
    ContasPagarModule,
  ],
  controllers: [ConciliacaoController],
  providers: [ConciliacaoService],
})
export class ConciliacaoModule {}
