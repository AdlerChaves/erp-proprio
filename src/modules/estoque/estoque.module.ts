import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Produto } from '../produtos/produto.entity';
import { EstoqueController } from './estoque.controller';
import { EstoqueService } from './estoque.service';
import { MovimentacaoEstoque } from './movimentacao-estoque.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovimentacaoEstoque, Produto])],
  controllers: [EstoqueController],
  providers: [EstoqueService],
  exports: [EstoqueService],
})
export class EstoqueModule {}
