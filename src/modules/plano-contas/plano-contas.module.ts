import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanoConta } from './plano-conta.entity';
import { PlanoContasController } from './plano-contas.controller';
import { PlanoContasService } from './plano-contas.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlanoConta])],
  controllers: [PlanoContasController],
  providers: [PlanoContasService],
  exports: [PlanoContasService],
})
export class PlanoContasModule {}
