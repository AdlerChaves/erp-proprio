import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnexosModule } from '../anexos/anexos.module';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ClientesModule } from '../clientes/clientes.module';
import { ContasBancariasModule } from '../contas-bancarias/contas-bancarias.module';
import { MovimentacoesModule } from '../movimentacoes/movimentacoes.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { ContaReceber } from './conta-receber.entity';
import { ContasReceberController } from './contas-receber.controller';
import { ContasReceberService } from './contas-receber.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContaReceber]),
    ClientesModule,
    PlanoContasModule,
    CentrosCustoModule,
    ContasBancariasModule,
    MovimentacoesModule,
    AnexosModule,
  ],
  controllers: [ContasReceberController],
  providers: [ContasReceberService],
  exports: [ContasReceberService],
})
export class ContasReceberModule {}
