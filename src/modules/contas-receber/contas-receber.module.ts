import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesModule } from '../clientes/clientes.module';
import { ContaReceber } from './conta-receber.entity';
import { ContasReceberController } from './contas-receber.controller';
import { ContasReceberService } from './contas-receber.service';

@Module({
  imports: [TypeOrmModule.forFeature([ContaReceber]), ClientesModule],
  controllers: [ContasReceberController],
  providers: [ContasReceberService],
})
export class ContasReceberModule {}
