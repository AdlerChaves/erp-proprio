import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContaBancaria } from './conta-bancaria.entity';
import { ContasBancariasController } from './contas-bancarias.controller';
import { ContasBancariasService } from './contas-bancarias.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContaBancaria])],
  controllers: [ContasBancariasController],
  providers: [ContasBancariasService],
  exports: [ContasBancariasService],
})
export class ContasBancariasModule {}
