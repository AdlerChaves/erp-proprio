import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { hoje } from '../../common/datas';
import { CentroCusto } from '../centros-custo/centro-custo.entity';
import { Empresa } from '../empresas/empresa.entity';
import { CreateEtapaObraDto, UpdateEtapaObraDto, UpdateObraDto } from './dto/apontamento.dto';
import { EtapaCentroCusto } from './etapa-centro-custo.entity';
import { EtapaPadrao } from './etapa-padrao.entity';
import { exigirMesmosIds } from './etapas-padrao.service';

/** Obra como o painel recebe: o Centro de Custo com situação, observação e etapas em ordem. */
function apresentar(centro: CentroCusto, etapas: EtapaCentroCusto[]) {
  return {
    id: centro.id,
    nome: centro.nome,
    situacao: centro.situacao,
    observacao: centro.observacao,
    etapas: etapas.map((e) => ({ id: e.id, nome: e.nome, ordem: e.ordem, dataLimite: e.dataLimite, concluidaEm: e.concluidaEm })),
  };
}

/**
 * Acompanhamento das obras: cada Centro de Custo ativo é uma obra, com suas etapas, situação e observação.
 * As regras de cor (prazo, alerta) ficam no painel; aqui só os dados e os dias de alerta da empresa.
 */
@Injectable()
export class ApontamentoService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(CentroCusto) private readonly centros: Repository<CentroCusto>,
    @InjectRepository(EtapaCentroCusto) private readonly etapas: Repository<EtapaCentroCusto>,
  ) {}

  async painel(empresaId: string) {
    const empresa = await this.dataSource.getRepository(Empresa).findOneOrFail({ where: { id: empresaId }, select: { id: true, diasAlertaEtapa: true } });
    const centros = await this.centros.find({ where: { empresaId, ativo: true }, order: { nome: 'ASC' } });
    const etapas = centros.length
      ? await this.etapas.find({ where: { empresaId, centroCustoId: In(centros.map((c) => c.id)) }, order: { ordem: 'ASC' } })
      : [];
    return {
      diasAlerta: empresa.diasAlertaEtapa,
      obras: centros.map((c) => apresentar(c, etapas.filter((e) => e.centroCustoId === c.id))),
    };
  }

  private async centro(m: EntityManager, empresaId: string, id: string) {
    const centro = await m.findOneBy(CentroCusto, { id, empresaId });
    if (!centro) throw new NotFoundException(`Centro de custo ${id} não encontrado`);
    return centro;
  }

  private async obraDe(m: EntityManager, empresaId: string, centro: CentroCusto) {
    return apresentar(centro, await m.find(EtapaCentroCusto, { where: { empresaId, centroCustoId: centro.id }, order: { ordem: 'ASC' } }));
  }

  async obra(empresaId: string, id: string) {
    const m = this.dataSource.manager;
    return this.obraDe(m, empresaId, await this.centro(m, empresaId, id));
  }

  async atualizarObra(empresaId: string, id: string, dto: UpdateObraDto) {
    const m = this.dataSource.manager;
    const centro = await this.centro(m, empresaId, id);
    if (dto.situacao !== undefined) centro.situacao = dto.situacao;
    if (dto.observacao !== undefined) centro.observacao = dto.observacao?.trim() || null;
    await m.save(centro);
    return this.obraDe(m, empresaId, centro);
  }

  async incluirEtapa(empresaId: string, id: string, dto: CreateEtapaObraDto) {
    return this.dataSource.transaction(async (m) => {
      const centro = await this.centro(m, empresaId, id);
      const maior: number | null = (await m.maximum(EtapaCentroCusto, 'ordem', { empresaId, centroCustoId: id })) ?? 0;
      await m.save(m.create(EtapaCentroCusto, { empresaId, centroCustoId: id, nome: dto.nome.trim(), dataLimite: dto.dataLimite ?? null, ordem: maior + 1 }));
      return this.obraDe(m, empresaId, centro);
    });
  }

  /** Copia as etapas padrão ativas, na ordem; só para obra ainda sem etapas. */
  async aplicarPadrao(empresaId: string, id: string) {
    return this.dataSource.transaction(async (m) => {
      const centro = await this.centro(m, empresaId, id);
      if (await m.existsBy(EtapaCentroCusto, { empresaId, centroCustoId: id })) {
        throw new BadRequestException('Esta obra já tem etapas; inclua ou edite as etapas uma a uma');
      }
      const padrao = await m.find(EtapaPadrao, { where: { empresaId, ativo: true }, order: { ordem: 'ASC' } });
      if (padrao.length === 0) throw new BadRequestException('Não há etapas padrão ativas; cadastre-as em Cadastros > Etapas padrão');
      await m.save(padrao.map((p, i) => m.create(EtapaCentroCusto, { empresaId, centroCustoId: id, nome: p.nome, ordem: i + 1 })));
      return this.obraDe(m, empresaId, centro);
    });
  }

  private async etapa(m: EntityManager, empresaId: string, centroId: string, etapaId: string) {
    const etapa = await m.findOneBy(EtapaCentroCusto, { id: etapaId, empresaId, centroCustoId: centroId });
    if (!etapa) throw new NotFoundException(`Etapa ${etapaId} não encontrada nesta obra`);
    return etapa;
  }

  async atualizarEtapa(empresaId: string, centroId: string, etapaId: string, dto: UpdateEtapaObraDto) {
    const m = this.dataSource.manager;
    const centro = await this.centro(m, empresaId, centroId);
    const etapa = await this.etapa(m, empresaId, centroId, etapaId);
    if (dto.nome !== undefined) etapa.nome = dto.nome.trim();
    if (dto.dataLimite !== undefined) etapa.dataLimite = dto.dataLimite;
    if (dto.concluida !== undefined) etapa.concluidaEm = dto.concluida ? (etapa.concluidaEm ?? hoje()) : null;
    await m.save(etapa);
    return this.obraDe(m, empresaId, centro);
  }

  async excluirEtapa(empresaId: string, centroId: string, etapaId: string) {
    return this.dataSource.transaction(async (m) => {
      const centro = await this.centro(m, empresaId, centroId);
      await m.remove(await this.etapa(m, empresaId, centroId, etapaId));
      // Mantém a numeração contínua (1, 2, 3...) depois da exclusão.
      const restantes = await m.find(EtapaCentroCusto, { where: { empresaId, centroCustoId: centroId }, order: { ordem: 'ASC' } });
      for (const [i, e] of restantes.entries()) if (e.ordem !== i + 1) await m.update(EtapaCentroCusto, { id: e.id }, { ordem: i + 1 });
      return this.obraDe(m, empresaId, centro);
    });
  }

  async reordenarEtapas(empresaId: string, centroId: string, ids: string[]) {
    return this.dataSource.transaction(async (m) => {
      const centro = await this.centro(m, empresaId, centroId);
      const atuais = await m.find(EtapaCentroCusto, { where: { empresaId, centroCustoId: centroId }, select: { id: true } });
      exigirMesmosIds(atuais.map((e) => e.id), ids);
      for (const [i, id] of ids.entries()) await m.update(EtapaCentroCusto, { id, empresaId }, { ordem: i + 1 });
      return this.obraDe(m, empresaId, centro);
    });
  }
}
