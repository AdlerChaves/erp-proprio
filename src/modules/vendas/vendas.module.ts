import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ClientesModule } from '../clientes/clientes.module';
import { ContasReceberModule } from '../contas-receber/contas-receber.module';
import { EstoqueModule } from '../estoque/estoque.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { NotaServico } from '../nfse/nota-servico.entity';
import { Produto } from '../produtos/produto.entity';
import { ItemVenda } from './item-venda.entity';
import { Venda } from './venda.entity';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Venda, ItemVenda, Produto, NotaServico]),
    ClientesModule,
    PlanoContasModule,
    CentrosCustoModule,
    ContasReceberModule,
    EstoqueModule,
  ],
  controllers: [VendasController],
  providers: [VendasService],
})
export class VendasModule {}
