import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { detectarTipo, nomeSeguro } from '../../common/arquivo';
import { ContaPagar } from '../contas-pagar/conta-pagar.entity';
import { ContaReceber } from '../contas-receber/conta-receber.entity';
import { Anexo } from './anexo.entity';

export type OrigemAnexo = 'pagar' | 'receber';

export const LIMITE_TAMANHO_ANEXO = 10 * 1024 * 1024;
export const LIMITE_ANEXOS_POR_CONTA = 20;

const ORIGENS = {
  pagar: { entidade: ContaPagar, coluna: 'contaPagarId', nome: 'Conta a pagar' },
  receber: { entidade: ContaReceber, coluna: 'contaReceberId', nome: 'Conta a receber' },
} as const;

/** O que o upload do multer entrega e o serviço usa. */
export interface ArquivoRecebido {
  originalname: string;
  buffer: Buffer;
}

/** Colunas da listagem: nunca o conteúdo, e de quem enviou só id e nome. */
const COLUNAS = {
  id: true,
  nome: true,
  tipo: true,
  tamanho: true,
  criadoEm: true,
  enviadoPor: { id: true, nome: true },
} as const;

/** Anexo como a API devolve: sem o conteúdo e só com o nome de quem enviou. */
function apresentar(anexo: Anexo) {
  return {
    id: anexo.id,
    nome: anexo.nome,
    tipo: anexo.tipo,
    tamanho: anexo.tamanho,
    criadoEm: anexo.criadoEm,
    enviadoPor: anexo.enviadoPor ? { id: anexo.enviadoPor.id, nome: anexo.enviadoPor.nome } : null,
  };
}

@Injectable()
export class AnexosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Anexo) private readonly repo: Repository<Anexo>,
  ) {}

  /** 404 se a conta não existe na empresa; com `travar`, bloqueia a linha até o fim da transação. */
  private async garantirConta(manager: EntityManager, empresaId: string, origem: OrigemAnexo, contaId: string, travar = false) {
    const { entidade, nome } = ORIGENS[origem];
    const conta = await manager.findOne(entidade, {
      where: { id: contaId, empresaId },
      select: { id: true },
      ...(travar ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!conta) throw new NotFoundException(`${nome} ${contaId} não encontrada`);
  }

  private onde(empresaId: string, origem: OrigemAnexo, contaId: string, id?: string) {
    return { ...(id ? { id } : {}), empresaId, [ORIGENS[origem].coluna]: contaId };
  }

  async listar(empresaId: string, origem: OrigemAnexo, contaId: string) {
    await this.garantirConta(this.dataSource.manager, empresaId, origem, contaId);
    const anexos = await this.repo.find({
      where: this.onde(empresaId, origem, contaId),
      select: COLUNAS,
      relations: { enviadoPor: true },
      order: { criadoEm: 'ASC' },
    });
    return anexos.map(apresentar);
  }

  async enviar(empresaId: string, usuarioId: string, origem: OrigemAnexo, contaId: string, arquivo: ArquivoRecebido | undefined) {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo no campo "arquivo"');
    const tipo = detectarTipo(arquivo.buffer);
    if (!tipo) throw new BadRequestException('Envie o arquivo em PDF, PNG, JPEG ou XML');

    const id = await this.dataSource.transaction(async (manager) => {
      // A trava na conta impede que dois envios simultâneos passem juntos do limite.
      await this.garantirConta(manager, empresaId, origem, contaId, true);
      const quantidade = await manager.count(Anexo, { where: this.onde(empresaId, origem, contaId) });
      if (quantidade >= LIMITE_ANEXOS_POR_CONTA) {
        throw new BadRequestException(`Cada conta aceita até ${LIMITE_ANEXOS_POR_CONTA} anexos; exclua algum antes de enviar outro`);
      }
      const anexo = await manager.save(
        manager.create(Anexo, {
          empresaId,
          [ORIGENS[origem].coluna]: contaId,
          nome: nomeSeguro(arquivo.originalname, tipo),
          tipo: tipo.mime,
          tamanho: arquivo.buffer.length,
          conteudo: arquivo.buffer,
          enviadoPorId: usuarioId,
        }),
      );
      return anexo.id;
    });

    const salvo = await this.repo.findOneOrFail({ where: { id }, select: COLUNAS, relations: { enviadoPor: true } });
    return apresentar(salvo);
  }

  /** Nome, tipo e conteúdo para o download. */
  async baixar(empresaId: string, origem: OrigemAnexo, contaId: string, id: string) {
    const anexo = await this.repo.findOne({
      where: this.onde(empresaId, origem, contaId, id),
      select: { id: true, nome: true, tipo: true, conteudo: true },
    });
    if (!anexo) throw new NotFoundException('Anexo não encontrado');
    return anexo;
  }

  async excluir(empresaId: string, origem: OrigemAnexo, contaId: string, id: string) {
    const { affected } = await this.repo.delete(this.onde(empresaId, origem, contaId, id));
    if (!affected) throw new NotFoundException('Anexo não encontrado');
    return { id };
  }

  /** Quantidade de anexos de cada conta, para a listagem (contas sem anexo ficam fora do mapa). */
  async contar(empresaId: string, origem: OrigemAnexo, contaIds: string[]) {
    if (!contaIds.length) return new Map<string, number>();
    const coluna = ORIGENS[origem].coluna;
    const linhas: { contaId: string; quantidade: string }[] = await this.repo
      .createQueryBuilder('a')
      .select(`a.${coluna}`, 'contaId')
      .addSelect('COUNT(*)', 'quantidade')
      .where({ empresaId, [coluna]: In(contaIds) })
      .groupBy(`a.${coluna}`)
      .getRawMany();
    return new Map(linhas.map((l) => [l.contaId, Number(l.quantidade)]));
  }
}
