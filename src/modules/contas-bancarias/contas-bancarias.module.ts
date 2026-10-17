import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovimentacaoBancaria } from '../movimentacoes/movimentacao-bancaria.entity';
import { ContaBancaria } from './conta-bancaria.entity';
import { ContasBancariasController } from './contas-bancarias.controller';
import { ContasBancariasService } from './contas-bancarias.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContaBancaria, MovimentacaoBancaria])],
  controllers: [ContasBancariasController],
  providers: [ContasBancariasService],
  exports: [ContasBancariasService],
})
export class ContasBancariasModule {}
