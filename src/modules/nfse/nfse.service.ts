import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { dataHoraComFuso, hoje } from '../../common/datas';
import { centavos, reais } from '../../common/dinheiro';
import { documentoValido } from '../../common/documento';
import { proximoNumero } from '../../common/numeracao';
import { milesimos, totalItem } from '../../common/quantidade';
import { Cliente } from '../clientes/cliente.entity';
import { Empresa, RegimeTributario } from '../empresas/empresa.entity';
import { TipoProduto } from '../produtos/produto.entity';
import { ItemVenda } from '../vendas/item-venda.entity';
import { StatusVenda, Venda } from '../vendas/venda.entity';
import { CancelarNotaServicoDto } from './dto/cancelar-nota.dto';
import { FiltroNotasServicoDto } from './dto/filtro-notas.dto';
import { GerarNotaServicoDto } from './dto/gerar-nota.dto';
import { RegistrarEmissaoDto } from './dto/registrar-emissao.dto';
import { gerarDps, validarDps } from './dps';
import { NotaServico, StatusNotaServico } from './nota-servico.entity';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** O Intl separa "R$" do valor com espaço não separável; no documento fiscal, espaço comum. */
const moeda = (valor: number) => MOEDA.format(valor).replace(/\u00a0/g, ' ');
const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

@Injectable()
export class NfseService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NotaServico) private readonly repo: Repository<NotaServico>,
    @InjectRepository(Empresa) private readonly empresas: Repository<Empresa>,
    @InjectRepository(Venda) private readonly vendas: Repository<Venda>,
    @InjectRepository(Cliente) private readonly clientes: Repository<Cliente>,
  ) {}

  findAll(empresaId: string, filtro: FiltroNotasServicoDto) {
    const where: FindOptionsWhere<NotaServico> = {
      empresaId,
      status: filtro.status,
      vendaId: filtro.vendaId,
      clienteId: filtro.clienteId,
    };
    if (filtro.de && filtro.ate) where.dataCompetencia = Between(filtro.de, filtro.ate);
    else if (filtro.de) where.dataCompetencia = MoreThanOrEqual(filtro.de);
    else if (filtro.ate) where.dataCompetencia = LessThanOrEqual(filtro.ate);
    return this.repo.find({ where, relations: { cliente: true, venda: true }, order: { numeroDps: 'DESC' } });
  }

  async findOne(empresaId: string, id: string) {
    const nota = await this.repo.findOne({ where: { id, empresaId }, relations: { cliente: true, venda: true } });
    if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
    return nota;
  }

  /** O XML da DPS, para importar no portal da prefeitura ou conferir. */
  async xml(empresaId: string, id: string) {
    const nota = await this.repo.findOne({ where: { id, empresaId }, select: { id: true, serie: true, numeroDps: true, xmlDps: true } });
    if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
    return { nome: `DPS-${nota.serie}-${nota.numeroDps}.xml`, conteudo: nota.xmlDps };
  }

  /**
   * Gera as DPS dos serviços de uma venda faturada: uma por código de tributação nacional, porque cada
   * NFS-e descreve um único serviço. Produtos da venda não entram (eles vão em NF-e, não em NFS-e).
   */
  async gerarParaVenda(empresaId: string, vendaId: string, dto: GerarNotaServicoDto) {
    const venda = await this.vendas.findOne({
      where: { id: vendaId, empresaId },
      relations: { itens: { produto: true } },
      order: { itens: { ordem: 'ASC' } },
    });
    if (!venda) throw new NotFoundException(`Venda ${vendaId} não encontrada`);

    const empresa = await this.empresas.findOneByOrFail({ id: empresaId });
    this.validarEmpresa(empresa);
    if (empresa.regimeTributario === RegimeTributario.SIMPLES_NACIONAL && dto.issRetido && dto.aliquotaIss === undefined) {
      throw new BadRequestException('Com ISS retido, informe a alíquota de ISS da sua faixa do Simples (de 2% a 5%)');
    }
    if (venda.status !== StatusVenda.FATURADA) {
      throw new BadRequestException(`A venda nº ${venda.numero} precisa estar faturada para gerar a nota de serviço`);
    }
    const cliente = await this.clientes.findOneByOrFail({ id: venda.clienteId });
    if (!documentoValido(cliente.documento)) {
      throw new BadRequestException(`O CPF/CNPJ do cliente ${cliente.nome} é inválido; corrija o cadastro antes de emitir`);
    }

    const servicos = venda.itens.filter((i) => i.produto.tipo === TipoProduto.SERVICO);
    if (servicos.length === 0) throw new BadRequestException(`A venda nº ${venda.numero} não tem serviços`);
    const semCodigo = servicos.filter((i) => !i.produto.codigoTributacaoNacional);
    if (semCodigo.length) {
      throw new BadRequestException(
        `Informe o código de tributação nacional no cadastro de: ${[...new Set(semCodigo.map((i) => i.produto.descricao))].join(', ')}`,
      );
    }
    const grupos = this.agrupar(servicos);
    if (dto.descricao && grupos.length > 1) {
      throw new BadRequestException('A venda gera mais de uma nota (serviços com códigos diferentes); a descrição é montada por nota');
    }

    const dataCompetencia = dto.dataCompetencia ?? venda.dataFaturamento ?? hoje();
    if (dataCompetencia > hoje()) throw new BadRequestException('A data de competência não pode ser futura');

    const ids = await this.dataSource.transaction(async (m) => {
      // Trava a venda: duas pessoas não geram notas em dobro ao mesmo tempo.
      await m.findOne(Venda, { where: { id: vendaId }, lock: { mode: 'pessimistic_write' } });
      const existentes = await m.countBy(NotaServico, {
        vendaId,
        status: In([StatusNotaServico.PENDENTE, StatusNotaServico.EMITIDA]),
      });
      if (existentes) {
        throw new ConflictException(`A venda nº ${venda.numero} já tem nota de serviço; cancele-a antes de gerar outra`);
      }

      const geradas: string[] = [];
      for (const grupo of grupos) {
        const numero = await proximoNumero(m, 'notas_servico', empresaId);
        const geradaEm = new Date();
        const dados = {
          codigoTributacaoNacional: grupo.codigo,
          codigoNbs: grupo.nbs,
          municipioPrestacao: dto.municipioPrestacao ?? empresa.codigoMunicipio!,
          descricao: dto.descricao ?? this.descrever(grupo.itens, venda),
          valorServicos: reais(grupo.bruto),
          descontoIncondicionado: reais(grupo.desconto),
          issRetido: dto.issRetido ?? false,
          aliquotaIss: dto.issRetido ? (dto.aliquotaIss ?? null) : null,
        };
        const xml = gerarDps({
          ambiente: empresa.nfseAmbiente,
          dataHoraEmissao: dataHoraComFuso(geradaEm),
          serie: empresa.nfseSerie,
          numero,
          dataCompetencia,
          municipioEmissor: empresa.codigoMunicipio!,
          prestador: {
            cnpj: empresa.cnpj,
            inscricaoMunicipal: empresa.inscricaoMunicipal,
            regime: empresa.regimeTributario!,
            regimeApuracaoSimples: empresa.regimeApuracaoSimples,
            aliquotaSimples: empresa.aliquotaSimples,
          },
          tomador: {
            documento: cliente.documento,
            nome: cliente.nome,
            inscricaoMunicipal: cliente.inscricaoMunicipal,
            endereco: cliente.endereco,
            telefone: cliente.telefone,
            email: cliente.email,
          },
          servico: dados,
          valores: {
            servicos: dados.valorServicos,
            descontoIncondicionado: dados.descontoIncondicionado,
            issRetido: dados.issRetido,
            aliquotaIss: dados.aliquotaIss,
          },
        });
        const erros = await validarDps(xml);
        if (erros.length) {
          throw new BadRequestException(`A DPS não passou na validação do esquema oficial: ${erros.join('; ')}`);
        }
        const nota = await m.save(
          m.create(NotaServico, {
            ...dados,
            empresaId,
            vendaId,
            clienteId: cliente.id,
            ambiente: empresa.nfseAmbiente,
            serie: empresa.nfseSerie,
            numeroDps: numero,
            dataCompetencia,
            geradaEm,
            xmlDps: xml,
          }),
        );
        geradas.push(nota.id);
      }
      return geradas;
    });
    return this.repo.find({ where: { id: In(ids) }, relations: { cliente: true, venda: true }, order: { numeroDps: 'ASC' } });
  }

  /** Registra o número da NFS-e emitida no portal da prefeitura. */
  async registrarEmissao(empresaId: string, id: string, dto: RegistrarEmissaoDto) {
    const nota = await this.findOne(empresaId, id);
    if (nota.status !== StatusNotaServico.PENDENTE) {
      throw new BadRequestException(`A nota está ${nota.status}; só notas pendentes recebem o número da NFS-e`);
    }
    if (dto.dataEmissao < nota.dataCompetencia) {
      throw new BadRequestException('A emissão da NFS-e não pode ser antes da data de competência');
    }
    await this.repo.update(id, {
      status: StatusNotaServico.EMITIDA,
      numeroNfse: dto.numeroNfse.replace(/^0+(?=\d)/, ''),
      dataEmissaoNfse: dto.dataEmissao,
      codigoVerificacao: dto.codigoVerificacao ?? null,
      chaveAcesso: dto.chaveAcesso?.toUpperCase() ?? null,
    });
    return this.findOne(empresaId, id);
  }

  /** Cancela no ERP. Se a NFS-e já foi emitida, ela precisa ter sido cancelada também no portal da prefeitura. */
  async cancelar(empresaId: string, id: string, dto: CancelarNotaServicoDto) {
    const nota = await this.findOne(empresaId, id);
    if (nota.status === StatusNotaServico.CANCELADA) throw new BadRequestException('A nota já está cancelada');
    await this.repo.update(id, { status: StatusNotaServico.CANCELADA, motivoCancelamento: dto.motivo.trim() });
    return this.findOne(empresaId, id);
  }

  /** O que falta no cadastro da empresa para emitir; a mensagem lista tudo de uma vez. */
  private validarEmpresa(empresa: Empresa) {
    const faltas: string[] = [];
    if (!empresa.regimeTributario) faltas.push('regime tributário');
    if (!empresa.codigoMunicipio) faltas.push('município (código IBGE)');
    if (!empresa.inscricaoMunicipal) faltas.push('inscrição municipal');
    if (empresa.regimeTributario === RegimeTributario.SIMPLES_NACIONAL && !empresa.aliquotaSimples) {
      faltas.push('percentual aproximado de tributos do Simples');
    }
    if (faltas.length) throw new BadRequestException(`Preencha os dados fiscais da empresa: ${faltas.join(', ')}`);
    if (!documentoValido(empresa.cnpj)) {
      throw new BadRequestException('O CNPJ da empresa tem dígito verificador inválido; a nota seria recusada');
    }
    if (empresa.regimeTributario !== RegimeTributario.SIMPLES_NACIONAL && empresa.regimeTributario !== RegimeTributario.MEI) {
      throw new BadRequestException('A emissão de nota de serviço ainda só está disponível para empresas do Simples Nacional e MEI');
    }
  }

  /** Um grupo por código nacional + NBS, com os valores em centavos. */
  private agrupar(itens: ItemVenda[]) {
    const grupos = new Map<string, { codigo: string; nbs: string | null; itens: ItemVenda[]; bruto: number; desconto: number }>();
    for (const item of itens) {
      const codigo = item.produto.codigoTributacaoNacional!;
      const nbs = item.produto.codigoNbs;
      const chave = `${codigo}:${nbs ?? ''}`;
      const grupo = grupos.get(chave) ?? { codigo, nbs, itens: [], bruto: 0, desconto: 0 };
      grupo.itens.push(item);
      grupo.bruto += totalItem(milesimos(item.quantidade), centavos(item.precoUnitario));
      grupo.desconto += centavos(item.desconto);
      grupos.set(chave, grupo);
    }
    return [...grupos.values()];
  }

  /** "Suporte técnico mensal - 2 x R$ 150,00" por item, mais a referência da venda e as observações. */
  private descrever(itens: ItemVenda[], venda: Venda) {
    const linhas = itens.map((i) => {
      const quantidade = i.quantidade === 1 ? '' : ` - ${QTD.format(i.quantidade)} x ${moeda(i.precoUnitario)}`;
      return `${i.descricao}${quantidade}`;
    });
    linhas.push(`Ref. venda nº ${venda.numero}`);
    if (venda.observacoes) linhas.push(venda.observacoes);
    return linhas.join('\n').slice(0, 2000);
  }
}
