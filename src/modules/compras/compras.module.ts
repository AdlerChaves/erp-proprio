import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentrosCustoModule } from '../centros-custo/centros-custo.module';
import { ContasPagarModule } from '../contas-pagar/contas-pagar.module';
import { EstoqueModule } from '../estoque/estoque.module';
import { FornecedoresModule } from '../fornecedores/fornecedores.module';
import { PlanoContasModule } from '../plano-contas/plano-contas.module';
import { Produto } from '../produtos/produto.entity';
import { Compra } from './compra.entity';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';
import { ItemCompra } from './item-compra.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Compra, ItemCompra, Produto]),
    FornecedoresModule,
    PlanoContasModule,
    CentrosCustoModule,
    ContasPagarModule,
    EstoqueModule,
  ],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
