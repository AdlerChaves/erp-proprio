import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { centavos, reais } from '../../common/dinheiro';
import { proximoNumero } from '../../common/numeracao';
import { milesimos, totalItem } from '../../common/quantidade';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ClientesService } from '../clientes/clientes.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { Produto, TipoProduto } from '../produtos/produto.entity';
import { Contrato, GeracaoContrato, ItemContrato, SituacaoContrato } from './contrato.entity';
import { CreateContratoDto, ItemContratoDto } from './dto/create-contrato.dto';
import { FiltroContratosDto } from './dto/filtro-contratos.dto';
import { UpdateContratoDto } from './dto/update-contrato.dto';

@Injectable()
export class ContratosService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Contrato) private readonly repo: Repository<Contrato>,
    @InjectRepository(Produto) private readonly produtos: Repository<Produto>,
    @InjectRepository(GeracaoContrato) private readonly geracoes: Repository<GeracaoContrato>,
    private readonly clientes: ClientesService,
    private readonly planoContas: PlanoContasService,
    private readonly centrosCusto: CentrosCustoService,
  ) {}

  findAll(empresaId: string, filtro: FiltroContratosDto) {
    return this.repo.find({
      where: { empresaId, situacao: filtro.situacao, clienteId: filtro.clienteId },
      relations: { cliente: true },
      order: { numero: 'DESC' },
    });
  }

  /** O contrato com itens, classificação e as cobranças já geradas (as mais recentes primeiro). */
  async findOne(empresaId: string, id: string) {
    const contrato = await this.repo.findOne({
      where: { id, empresaId },
      relations: { cliente: true, planoConta: true, centroCusto: true, itens: { produto: true } },
      order: { itens: { ordem: 'ASC' } },
    });
    if (!contrato) throw new NotFoundException(`Contrato ${id} não encontrado`);
    const geracoes = await this.geracoes.find({
      where: { contratoId: id },
      relations: { venda: true },
      order: { competencia: 'DESC' },
      take: 24,
    });
    return { ...contrato, geracoes };
  }

  async create(empresaId: string, dto: CreateContratoDto) {
    const { itens, valor } = await this.validar(empresaId, {
      ...dto,
      fim: dto.fim ?? null,
      emitirNfse: dto.emitirNfse ?? false,
      transmitirNfse: dto.transmitirNfse ?? false,
    });
    const { itens: _, ...dados } = dto;
    const id = await this.dataSource.transaction(async (m) => {
      const contrato = await m.save(
        m.create(Contrato, {
          ...dados,
          descricao: dto.descricao.trim(),
          observacoes: dto.observacoes?.trim() || null,
          empresaId,
          numero: await proximoNumero(m, 'contratos', empresaId),
          valor,
        }),
      );
      await this.gravarItens(m, contrato.id, itens);
      return contrato.id;
    });
    return this.findOne(empresaId, id);
  }

  /** Vale para as próximas cobranças; as já geradas ficam como estão. */
  async update(empresaId: string, id: string, dto: UpdateContratoDto) {
    await this.dataSource.transaction(async (m) => {
      const contrato = await this.travar(m, empresaId, id);
      if (contrato.situacao === SituacaoContrato.ENCERRADO) throw new BadRequestException('Contrato encerrado não pode ser alterado');
      const atuais = await m.find(ItemContrato, { where: { contratoId: id }, order: { ordem: 'ASC' } });
      const final = {
        clienteId: dto.clienteId ?? contrato.clienteId,
        inicio: dto.inicio ?? contrato.inicio,
        fim: dto.fim === undefined ? contrato.fim : dto.fim,
        emitirNfse: dto.emitirNfse ?? contrato.emitirNfse,
        transmitirNfse: dto.transmitirNfse ?? contrato.transmitirNfse,
        planoContaId: dto.planoContaId,
        centroCustoId: dto.centroCustoId,
        itens: dto.itens ?? atuais,
      };
      // Desligar a emissão desliga também a transmissão, que depende dela.
      if (dto.emitirNfse === false && dto.transmitirNfse === undefined) final.transmitirNfse = false;
      const { itens, valor } = await this.validar(empresaId, final);

      const geradas = await m.find(GeracaoContrato, { where: { contratoId: id }, order: { competencia: 'ASC' } });
      if (geradas.length && final.inicio !== contrato.inicio && final.inicio > geradas[0].competencia) {
        throw new BadRequestException(`Já há cobrança gerada em ${mesAno(geradas[0].competencia)}; o início não pode ser depois dela`);
      }
      const ultima = geradas.at(-1)?.competencia;
      if (ultima && final.fim && final.fim < ultima) {
        throw new BadRequestException(`Já há cobrança gerada em ${mesAno(ultima)}; o fim não pode ser antes dela`);
      }

      if (dto.itens) {
        await m.delete(ItemContrato, { contratoId: id });
        await this.gravarItens(m, id, itens);
      }
      const { itens: _, ...dados } = dto;
      await m.update(Contrato, id, {
        ...dados,
        ...(dto.descricao !== undefined && { descricao: dto.descricao.trim() }),
        ...(dto.observacoes !== undefined && { observacoes: dto.observacoes?.trim() || null }),
        transmitirNfse: final.transmitirNfse,
        valor,
      });
    });
    return this.findOne(empresaId, id);
  }

  /** Pausar, reativar ou encerrar. Encerrado é definitivo. */
  async mudarSituacao(empresaId: string, id: string, situacao: SituacaoContrato) {
    await this.dataSource.transaction(async (m) => {
      const contrato = await this.travar(m, empresaId, id);
      if (contrato.situacao === SituacaoContrato.ENCERRADO) throw new BadRequestException('O contrato já está encerrado');
      if (contrato.situacao === situacao) return;
      if (situacao === SituacaoContrato.ATIVO) await this.clienteAtivo(empresaId, contrato.clienteId);
      await m.update(Contrato, id, { situacao });
    });
    return this.findOne(empresaId, id);
  }

  /** Só sai do cadastro o contrato que nunca gerou cobrança; os outros são encerrados. */
  async remove(empresaId: string, id: string) {
    await this.dataSource.transaction(async (m) => {
      await this.travar(m, empresaId, id);
      if (await m.countBy(GeracaoContrato, { contratoId: id })) {
        throw new BadRequestException('O contrato já gerou cobranças; encerre-o em vez de excluir');
      }
      await m.delete(Contrato, { id });
    });
  }

  /** Confere cliente, classificação, itens e as opções de nota; devolve os itens com os totais. */
  private async validar(
    empresaId: string,
    d: {
      clienteId: string;
      inicio: string;
      fim: string | null;
      emitirNfse: boolean;
      transmitirNfse: boolean;
      planoContaId?: string | null;
      centroCustoId?: string | null;
      itens: ItemContratoDto[];
    },
  ) {
    await this.clienteAtivo(empresaId, d.clienteId);
    if (d.planoContaId) await this.planoContas.findParaLancamento(empresaId, d.planoContaId, TipoPlanoConta.RECEITA);
    if (d.centroCustoId) await this.centrosCusto.findAtivo(empresaId, d.centroCustoId);
    if (d.fim && d.fim < d.inicio) throw new BadRequestException('O fim do contrato não pode ser antes do início');
    if (d.transmitirNfse && !d.emitirNfse) throw new BadRequestException('Para transmitir a NFS-e, ative também a emissão da nota');

    const produtos = await this.produtos.findBy({ empresaId, id: In(d.itens.map((i) => i.produtoId)) });
    const porId = new Map(produtos.map((p) => [p.id, p]));
    let valor = 0;
    const itens = d.itens.map((item, i) => {
      const produto = porId.get(item.produtoId);
      if (!produto) throw new BadRequestException(`Produto ${item.produtoId} não encontrado`);
      if (!produto.ativo) throw new BadRequestException(`${produto.descricao} está inativo`);
      const preco = centavos(item.precoUnitario ?? produto.precoVenda);
      const desconto = centavos(item.desconto ?? 0);
      const total = totalItem(milesimos(item.quantidade), preco, desconto);
      if (total < 0) throw new BadRequestException(`O desconto de ${produto.descricao} é maior que o valor do item`);
      valor += total;
      return { produto, produtoId: produto.id, ordem: i + 1, quantidade: item.quantidade, precoUnitario: reais(preco), desconto: reais(desconto), total: reais(total) };
    });
    if (valor <= 0) throw new BadRequestException('O valor mensal do contrato precisa ser maior que zero');
    if (d.emitirNfse && !itens.some((i) => i.produto.tipo === TipoProduto.SERVICO)) {
      throw new BadRequestException('Para emitir NFS-e, o contrato precisa de ao menos um serviço');
    }
    return { itens: itens.map(({ produto: _, ...item }) => item), valor: reais(valor) };
  }

  private async clienteAtivo(empresaId: string, clienteId: string) {
    const cliente = await this.clientes.findOne(empresaId, clienteId);
    if (!cliente.ativo) throw new BadRequestException(`O cliente ${cliente.nome} está inativo`);
  }

  private async gravarItens(m: EntityManager, contratoId: string, itens: Partial<ItemContrato>[]) {
    await m.save(itens.map((item) => m.create(ItemContrato, { ...item, contratoId })));
  }

  private async travar(m: EntityManager, empresaId: string, id: string) {
    const contrato = await m.findOne(Contrato, { where: { id, empresaId }, lock: { mode: 'pessimistic_write' } });
    if (!contrato) throw new NotFoundException(`Contrato ${id} não encontrado`);
    return contrato;
  }
}

/** "2026-10" → "10/2026". */
export const mesAno = (competencia: string) => `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
