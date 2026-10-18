import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cliente } from '../clientes/cliente.entity';
import { Empresa } from '../empresas/empresa.entity';
import { Venda } from '../vendas/venda.entity';
import { NfseController } from './nfse.controller';
import { NfseService } from './nfse.service';
import { NotaServico } from './nota-servico.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotaServico, Empresa, Venda, Cliente])],
  controllers: [NfseController],
  providers: [NfseService],
})
export class NfseModule {}
