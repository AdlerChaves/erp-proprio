import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { ApontamentoController, EtapasPadraoController } from './apontamento.controller';
import { ApontamentoService } from './apontamento.service';
import { EtapaCentroCusto } from './etapa-centro-custo.entity';
import { EtapaPadrao } from './etapa-padrao.entity';
import { EtapasPadraoService } from './etapas-padrao.service';

@Module({
  imports: [TypeOrmModule.forFeature([EtapaPadrao, EtapaCentroCusto, CentroCusto])],
  controllers: [EtapasPadraoController, ApontamentoController],
  providers: [EtapasPadraoService, ApontamentoService],
})
export class ApontamentoModule {}
