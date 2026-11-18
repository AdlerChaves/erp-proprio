import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateEtapaPadraoDto, UpdateEtapaPadraoDto } from './dto/apontamento.dto';
import { EtapaPadrao } from './etapa-padrao.entity';

/** Cadastro das etapas padrão da empresa (o modelo copiado para as obras). */
@Injectable()
export class EtapasPadraoService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EtapaPadrao) private readonly repo: Repository<EtapaPadrao>,
  ) {}

  findAll(empresaId: string) {
    return this.repo.find({ where: { empresaId }, order: { ordem: 'ASC', nome: 'ASC' } });
  }

  private async findOne(empresaId: string, id: string) {
    const etapa = await this.repo.findOneBy({ id, empresaId });
    if (!etapa) throw new NotFoundException(`Etapa padrão ${id} não encontrada`);
    return etapa;
  }

  private async garantirNomeLivre(empresaId: string, nome: string) {
    if (await this.repo.existsBy({ empresaId, nome })) throw new ConflictException(`Já existe a etapa padrão ${nome}`);
  }

  async create(empresaId: string, dto: CreateEtapaPadraoDto) {
    const nome = dto.nome.trim();
    await this.garantirNomeLivre(empresaId, nome);
    const maior: number | null = (await this.repo.maximum('ordem', { empresaId })) ?? 0;
    return this.repo.save(this.repo.create({ empresaId, nome, ordem: maior + 1 }));
  }

  async update(empresaId: string, id: string, dto: UpdateEtapaPadraoDto) {
    const etapa = await this.findOne(empresaId, id);
    const nome = dto.nome?.trim();
    if (nome && nome !== etapa.nome) await this.garantirNomeLivre(empresaId, nome);
    return this.repo.save(this.repo.merge(etapa, { ...dto, ...(nome ? { nome } : {}) }));
  }

  async remove(empresaId: string, id: string) {
    await this.repo.remove(await this.findOne(empresaId, id));
  }

  /** Reordena: a lista precisa ter exatamente todas as etapas padrão da empresa. */
  async reordenar(empresaId: string, ids: string[]) {
    await this.dataSource.transaction(async (m) => {
      const atuais = await m.find(EtapaPadrao, { where: { empresaId }, select: { id: true } });
      exigirMesmosIds(atuais.map((e) => e.id), ids);
      for (const [i, id] of ids.entries()) await m.update(EtapaPadrao, { id, empresaId }, { ordem: i + 1 });
    });
    return this.findAll(empresaId);
  }
}

/** A nova ordem só vale se trouxer todos os ids, uma vez cada, e nenhum de fora. */
export function exigirMesmosIds(atuais: string[], novos: string[]) {
  const conjunto = new Set(novos);
  if (conjunto.size !== novos.length || novos.length !== atuais.length || atuais.some((id) => !conjunto.has(id))) {
    throw new BadRequestException('Envie todos os itens da lista, uma vez cada, na nova ordem');
  }
}
