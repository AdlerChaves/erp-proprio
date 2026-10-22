import { Module } from '@nestjs/common';
import { ConsultaCepController } from './consulta-cep.controller';
import { ConsultaCepService } from './consulta-cep.service';

@Module({
  controllers: [ConsultaCepController],
  providers: [ConsultaCepService],
})
export class ConsultaCepModule {}
