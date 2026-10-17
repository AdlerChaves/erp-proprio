import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { FiltroAuditoriaDto } from './dto/filtro-auditoria.dto';
import { RegistroAuditoria } from './registro-auditoria.entity';

export type NovoRegistro = Pick<RegistroAuditoria, 'acao'> &
  Partial<Pick<RegistroAuditoria, 'empresaId' | 'usuarioId' | 'recurso' | 'recursoId' | 'dados' | 'ip'>>;

const CAMPO_SENSIVEL = /senha|password|token|secret/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Copia o objeto trocando o valor de campos sensíveis, em qualquer nível, por "***". */
export function ocultarSensiveis(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ocultarSensiveis);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [chave, CAMPO_SENSIVEL.test(chave) ? '***' : ocultarSensiveis(v)]),
    );
  }
  return valor;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(@InjectRepository(RegistroAuditoria) private readonly repo: Repository<RegistroAuditoria>) {}

  /** Nunca derruba a operação auditada: uma falha ao gravar só vai para o log. */
  async registrar(registro: NovoRegistro) {
    try {
      await this.repo.save(
        this.repo.create({
          ...registro,
          recursoId: registro.recursoId && UUID.test(registro.recursoId) ? registro.recursoId : null,
          dados: registro.dados ? (ocultarSensiveis(registro.dados) as Record<string, unknown>) : null,
        }),
      );
    } catch (erro) {
      this.logger.error(`Falha ao gravar auditoria de ${registro.acao}`, erro as Error);
    }
  }

  async findAll(empresaId: string, filtro: FiltroAuditoriaDto) {
    const where: FindOptionsWhere<RegistroAuditoria> = {
      empresaId,
      usuarioId: filtro.usuarioId,
      recurso: filtro.recurso,
      recursoId: filtro.recursoId,
    };
    const de = filtro.de && new Date(`${filtro.de}T00:00:00Z`);
    const ate = filtro.ate && new Date(`${filtro.ate}T23:59:59.999Z`);
    if (de && ate) where.criadoEm = Between(de, ate);
    else if (de) where.criadoEm = MoreThanOrEqual(de);
    else if (ate) where.criadoEm = LessThanOrEqual(ate);

    const limite = filtro.limite ?? 50;
    const [itens, total] = await this.repo.findAndCount({
      where,
      order: { seq: 'DESC' },
      take: limite,
      skip: filtro.deslocamento ?? 0,
    });
    return { itens, total, limite, deslocamento: filtro.deslocamento ?? 0 };
  }
}
