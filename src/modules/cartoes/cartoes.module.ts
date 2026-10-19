import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { CartaoCredito } from './cartao-credito.entity';
import { CartoesController } from './cartoes.controller';
import { CartoesService } from './cartoes.service';
import { FaturaCartao } from './fatura-cartao.entity';
import { LancamentoCartao } from './lancamento-cartao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CartaoCredito, FaturaCartao, LancamentoCartao]),
    ContasBancariasModule,
    FornecedoresModule,
    PlanoContasModule,
    CentrosCustoModule,
  ],
  controllers: [CartoesController],
  providers: [CartoesService],
})
export class CartoesModule {}
