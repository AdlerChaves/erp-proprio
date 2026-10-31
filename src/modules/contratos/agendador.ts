import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { Contrato, SituacaoContrato } from './contrato.entity';
import { competenciaDe, GeracaoContratosService, mesSeguinte } from './geracao.service';

/**
 * Gera sozinho as cobranças dos contratos quando chega o dia do faturamento. Roda a cada
 * CONTRATOS_AGENDADOR_MINUTOS (padrão 60; 0 desliga) e confere o mês atual e o anterior, para não perder o
 * fim do mês se o servidor estiver fora do ar nesses dias. Gerar de novo é seguro, então rodar em mais de uma
 * instância da API não duplica nada.
 */
@Injectable()
export class AgendadorContratos implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgendadorContratos.name);
  private temporizadores: NodeJS.Timeout[] = [];
  private rodando = false;

  constructor(
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
    private readonly geracao: GeracaoContratosService,
  ) {}

  onApplicationBootstrap() {
    const minutos = Number(process.env.CONTRATOS_AGENDADOR_MINUTOS ?? 60);
    if (!(minutos > 0)) return;
    // A primeira rodada espera a aplicação terminar de subir.
    this.temporizadores.push(setTimeout(() => void this.rodar(), 30_000), setInterval(() => void this.rodar(), minutos * 60_000));
  }

  onApplicationShutdown() {
    this.temporizadores.forEach(clearInterval);
  }

  /** Uma rodada: as empresas com contrato ativo, o mês anterior e o atual. */
  async rodar(dia = hoje()) {
    if (this.rodando) return { geradas: 0, falhas: 0 };
    this.rodando = true;
    const total = { geradas: 0, falhas: 0 };
    try {
      const empresas: { empresa_id: string }[] = await this.contratos
        .createQueryBuilder('c')
        .select('DISTINCT c.empresa_id', 'empresa_id')
        .where('c.situacao = :ativo', { ativo: SituacaoContrato.ATIVO })
        .getRawMany();
      const atual = competenciaDe(dia);
      for (const { empresa_id } of empresas) {
        for (const competencia of [mesSeguinte(atual, -1), atual]) {
          try {
            const r = await this.geracao.gerarPendentes(empresa_id, competencia, { automatica: true, hoje: dia });
            total.geradas += r.geradas;
            total.falhas += r.falhas;
          } catch (erro) {
            this.logger.error(`Falha na geração automática da empresa ${empresa_id} em ${competencia}`, erro as Error);
          }
        }
      }
      if (total.geradas || total.falhas) this.logger.log(`Contratos: ${total.geradas} cobrança(s) gerada(s), ${total.falhas} com falha`);
    } finally {
      this.rodando = false;
    }
    return total;
  }
}
