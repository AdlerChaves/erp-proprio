import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Anexo } from './anexo.entity';
import { AnexosContaPagarController, AnexosContaReceberController } from './anexos.controller';
import { AnexosService } from './anexos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Anexo])],
  controllers: [AnexosContaPagarController, AnexosContaReceberController],
  providers: [AnexosService],
  exports: [AnexosService],
})
export class AnexosModule {}
