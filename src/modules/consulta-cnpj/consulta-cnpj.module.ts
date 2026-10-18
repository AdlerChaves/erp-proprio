import { Module } from '@nestjs/common';
import { ConsultaCnpjController } from './consulta-cnpj.controller';
import { ConsultaCnpjService } from './consulta-cnpj.service';

@Module({
  controllers: [ConsultaCnpjController],
  providers: [ConsultaCnpjService],
})
export class ConsultaCnpjModule {}
