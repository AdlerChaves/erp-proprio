import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { DespesaRecorrente, SituacaoDespesa } from './despesa-recorrente.entity';
import { DespesasRecorrentesService } from './despesas-recorrentes.service';

/**
 * Lança sozinho as contas a pagar das despesas recorrentes quando chega o dia (vencimento menos a antecedência).
 * Roda a cada DESPESAS_AGENDADOR_MINUTOS (padrão 60; 0 desliga). Lançar de novo é seguro.
 */
@Injectable()
export class AgendadorDespesas implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AgendadorDespesas.name);
  private temporizadores: NodeJS.Timeout[] = [];
  private rodando = false;

  constructor(
    @InjectRepository(DespesaRecorrente) private readonly despesas: Repository<DespesaRecorrente>,
    private readonly service: DespesasRecorrentesService,
  ) {}

  onApplicationBootstrap() {
    const minutos = Number(process.env.DESPESAS_AGENDADOR_MINUTOS ?? 60);
    if (!(minutos > 0)) return;
    this.temporizadores.push(setTimeout(() => void this.rodar(), 40_000), setInterval(() => void this.rodar(), minutos * 60_000));
  }

  onApplicationShutdown() {
    this.temporizadores.forEach(clearInterval);
  }

  async rodar(dia = hoje()) {
    if (this.rodando) return 0;
    this.rodando = true;
    let total = 0;
    try {
      const empresas: { empresa_id: string }[] = await this.despesas
        .createQueryBuilder('d')
        .select('DISTINCT d.empresa_id', 'empresa_id')
        .where('d.situacao = :ativa', { ativa: SituacaoDespesa.ATIVA })
        .getRawMany();
      for (const { empresa_id } of empresas) {
        try {
          total += await this.service.lancarPendentes(empresa_id, { hoje: dia, automatica: true });
        } catch (erro) {
          this.logger.error(`Falha ao lançar as despesas recorrentes da empresa ${empresa_id}`, erro as Error);
        }
      }
      if (total) this.logger.log(`Despesas recorrentes: ${total} conta(s) a pagar lançada(s)`);
    } finally {
      this.rodando = false;
    }
    return total;
  }
}
