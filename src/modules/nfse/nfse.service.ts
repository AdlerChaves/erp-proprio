import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { decifrar } from '../../common/cifra';
import { gerarPdf } from '../documentos/documento-pdf';
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
import { assinarDps, assinarPedidoEvento } from './assinatura';
import { abrirCertificado } from './certificado';
import { CancelarNotaServicoDto } from './dto/cancelar-nota.dto';
import { FiltroNotasServicoDto } from './dto/filtro-notas.dto';
import { GerarNotaServicoDto } from './dto/gerar-nota.dto';
import { RegistrarEmissaoDto } from './dto/registrar-emissao.dto';
import { comDataHoraEmissao, gerarDps, idDoXml, validarDps } from './dps';
import { montarDanfse } from './danfse';
import { EVENTO_CANCELAMENTO, gerarPedidoCancelamento, motivoDoEvento, validarPedidoEvento } from './evento';
import { NotaServico, StatusNotaServico } from './nota-servico.entity';
import { FalhaComunicacaoSefinError, NfseGerada, RecusaSefinError, SefinCliente } from './sefin';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** O Intl separa "R$" do valor com espaço não separável; no documento fiscal, espaço comum. */
const moeda = (valor: number) => MOEDA.format(valor).replace(/\u00a0/g, ' ');
const QTD = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const campo = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1];

@Injectable()
export class NfseService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NotaServico) private readonly repo: Repository<NotaServico>,
    @InjectRepository(Empresa) private readonly empresas: Repository<Empresa>,
    @InjectRepository(Venda) private readonly vendas: Repository<Venda>,
    @InjectRepository(Cliente) private readonly clientes: Repository<Cliente>,
    private readonly sefin: SefinCliente,
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

  /** O XML da DPS, para conferir ou importar em outro emissor. */
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
    if (!cliente.documento) {
      throw new BadRequestException(`Informe o CPF/CNPJ no cadastro do cliente ${cliente.nome} antes de gerar a nota de serviço`);
    }
    const documentoTomador = cliente.documento;
    if (!documentoValido(documentoTomador)) {
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
            documento: documentoTomador,
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

  /** Registra o número de uma NFS-e emitida fora do ERP (no site do Emissor Nacional ou no portal da prefeitura). */
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

  /** O XML da NFS-e devolvido pelo Emissor Nacional. */
  async xmlNfse(empresaId: string, id: string) {
    const nota = await this.repo.findOne({ where: { id, empresaId }, select: { id: true, numeroNfse: true, chaveAcesso: true, xmlNfse: true } });
    if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
    if (!nota.xmlNfse) throw new NotFoundException('Esta nota não foi emitida pelo ERP; o XML dela está no Emissor Nacional');
    return { nome: `NFSe-${nota.chaveAcesso ?? nota.numeroNfse}.xml`, conteudo: nota.xmlNfse };
  }

  /**
   * Emite a NFS-e no Emissor Nacional: assina a DPS com o certificado A1 da empresa e a envia à Sefin Nacional,
   * que valida e devolve a nota na hora. A nota fica travada durante o envio, para dois cliques não emitirem em dobro.
   * Se uma tentativa anterior falhou sem resposta, confere antes se a Sefin chegou a gerar a nota.
   */
  async transmitir(empresaId: string, id: string) {
    await this.findOne(empresaId, id);
    const certificado = await this.certificado(empresaId);
    const falha = await this.dataSource.transaction(async (m) => {
      const nota = await m
        .createQueryBuilder(NotaServico, 'n')
        .addSelect('n.xmlDps')
        .where('n.id = :id AND n.empresa_id = :empresaId', { id, empresaId })
        .setLock('pessimistic_write')
        .getOne();
      if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
      if (nota.status !== StatusNotaServico.PENDENTE) {
        throw new BadRequestException(`A nota está ${nota.status.toLowerCase()}; só notas pendentes são transmitidas`);
      }

      let gerada: NfseGerada | null = null;
      let enviada = nota.xmlDps;
      try {
        if (nota.erroTransmissao) {
          const chave = await this.sefin.chaveDaDps(nota.ambiente, certificado, idDoXml(nota.xmlDps)!).catch(() => null);
          if (chave) gerada = await this.sefin.consultar(nota.ambiente, certificado, chave);
        }
        if (!gerada) {
          enviada = assinarDps(comDataHoraEmissao(nota.xmlDps, this.dataHoraEmissao(nota.dataCompetencia)), certificado);
          gerada = await this.sefin.emitir(nota.ambiente, certificado, enviada);
        }
      } catch (erro) {
        if (!(erro instanceof RecusaSefinError || erro instanceof FalhaComunicacaoSefinError)) throw erro;
        // O erro fica gravado (o throw desfaria a transação), e a resposta sai depois do commit.
        await m.update(NotaServico, id, { erroTransmissao: erro.message.slice(0, 1000) });
        return erro;
      }

      const dhProc = campo(gerada.xml, 'dhProc');
      await m.update(NotaServico, id, {
        status: StatusNotaServico.EMITIDA,
        chaveAcesso: gerada.chaveAcesso,
        numeroNfse: campo(gerada.xml, 'nNFSe')?.replace(/^0+(?=\d)/, '') ?? null,
        dataEmissaoNfse: dhProc && /^\d{4}-\d{2}-\d{2}/.test(dhProc) ? dhProc.slice(0, 10) : hoje(),
        codigoVerificacao: null,
        emitidaNoErp: true,
        xmlDps: enviada,
        xmlNfse: gerada.xml,
        erroTransmissao: null,
      });
      return null;
    });

    if (falha instanceof RecusaSefinError) throw new BadRequestException(`O Emissor Nacional recusou a nota: ${falha.message}`);
    if (falha) {
      throw new BadGatewayException(
        `${falha.message}. Tente de novo em alguns minutos: antes de reenviar, o ERP confere se a nota chegou a ser gerada.`,
      );
    }
    return this.findOne(empresaId, id);
  }

  /** O certificado A1 instalado na empresa, já aberto. */
  private async certificado(empresaId: string) {
    const empresa = await this.empresas.findOne({ where: { id: empresaId }, select: { id: true, certificadoCifrado: true } });
    if (!empresa?.certificadoCifrado) {
      throw new BadRequestException(
        'Instale o certificado digital A1 da empresa (tela Empresa, em Dados fiscais) para emitir ou cancelar notas no Emissor Nacional',
      );
    }
    let guardado: { pfx: string; senha: string };
    try {
      guardado = JSON.parse(decifrar(empresa.certificadoCifrado));
    } catch {
      throw new BadRequestException('Não foi possível ler o certificado guardado (a chave do servidor mudou?); instale-o de novo');
    }
    const certificado = abrirCertificado(Buffer.from(guardado.pfx, 'base64'), guardado.senha);
    if (certificado.validoAte < new Date()) {
      throw new BadRequestException('O certificado digital da empresa venceu; instale o novo na tela Empresa');
    }
    return certificado;
  }

  /**
   * Data e hora de um envio à Sefin: um minuto antes de agora, porque ela recusa documento "no futuro"
   * (E0008 na DPS, E1843 no evento) e os relógios nunca batem.
   */
  private dataHoraEnvio() {
    return dataHoraComFuso(new Date(Date.now() - 60_000));
  }

  /** dhEmi da DPS: a do envio, mas não antes do dia da competência, que não pode ser posterior à emissão. */
  private dataHoraEmissao(dataCompetencia: string) {
    const dataHora = this.dataHoraEnvio();
    return dataHora.slice(0, 10) < dataCompetencia ? `${dataCompetencia}T00:00:00${dataHora.slice(19)}` : dataHora;
  }

  /**
   * Cancela a nota. A NFS-e emitida pelo ERP é cancelada no Emissor Nacional, por evento; a emitida fora do ERP
   * precisa ser cancelada lá à mão, e aqui só se registra; a pendente nunca virou NFS-e.
   */
  async cancelar(empresaId: string, id: string, dto: CancelarNotaServicoDto) {
    const nota = await this.findOne(empresaId, id);
    if (nota.status === StatusNotaServico.CANCELADA) throw new BadRequestException('A nota já está cancelada');
    if (nota.status === StatusNotaServico.EMITIDA && nota.emitidaNoErp) return this.cancelarNoEmissor(empresaId, id, dto);
    await this.repo.update(id, { status: StatusNotaServico.CANCELADA, motivoCancelamento: dto.motivo.trim() });
    return this.findOne(empresaId, id);
  }

  /**
   * Envia o pedido de cancelamento (evento 101101) assinado com o certificado da empresa. A nota fica travada
   * durante o envio. Se a Sefin recusar, confere antes se a nota já tem cancelamento: é o caso de uma tentativa
   * anterior cuja resposta se perdeu, e então o cancelamento é só reconhecido.
   */
  private async cancelarNoEmissor(empresaId: string, id: string, dto: CancelarNotaServicoDto) {
    const motivo = dto.motivo.trim().replace(/\s+/g, ' ');
    if (!dto.codigoMotivo) {
      throw new BadRequestException('Informe o motivo do cancelamento: erro na emissão, serviço não prestado ou outros');
    }
    if (motivo.length < 15) {
      throw new BadRequestException('Descreva o motivo do cancelamento com pelo menos 15 caracteres (exigência do Emissor Nacional)');
    }
    const empresa = await this.empresas.findOneByOrFail({ id: empresaId });
    const certificado = await this.certificado(empresaId);

    const falha = await this.dataSource.transaction(async (m) => {
      const nota = await m.findOne(NotaServico, { where: { id, empresaId }, lock: { mode: 'pessimistic_write' } });
      if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
      if (nota.status !== StatusNotaServico.EMITIDA) {
        throw new BadRequestException(`A nota está ${nota.status.toLowerCase()}; só notas emitidas são canceladas no Emissor Nacional`);
      }
      const chave = nota.chaveAcesso!;
      const pedido = gerarPedidoCancelamento({
        ambiente: nota.ambiente,
        dataHoraEvento: this.dataHoraEnvio(),
        cnpjAutor: empresa.cnpj,
        chaveAcesso: chave,
        motivo: dto.codigoMotivo!,
        descricao: motivo,
      });
      const erros = await validarPedidoEvento(pedido);
      if (erros.length) {
        throw new BadRequestException(`O pedido de cancelamento não passou na validação do esquema oficial: ${erros.join('; ')}`);
      }

      let evento: string;
      try {
        evento = await this.sefin.registrarEvento(nota.ambiente, certificado, chave, assinarPedidoEvento(pedido, certificado));
      } catch (erro) {
        if (!(erro instanceof RecusaSefinError || erro instanceof FalhaComunicacaoSefinError)) throw erro;
        const existente = erro instanceof RecusaSefinError
          ? await this.sefin.evento(nota.ambiente, certificado, chave, EVENTO_CANCELAMENTO).catch(() => null)
          : null;
        if (!existente) return erro;
        evento = existente;
      }
      await m.update(NotaServico, id, {
        status: StatusNotaServico.CANCELADA,
        motivoCancelamento: motivoDoEvento(evento) ?? motivo,
        xmlCancelamento: evento,
      });
      return null;
    });

    if (falha instanceof RecusaSefinError) throw new BadRequestException(`O Emissor Nacional recusou o cancelamento: ${falha.message}`);
    if (falha) {
      throw new BadGatewayException(
        `${falha.message}. A nota continua emitida no ERP; tente de novo em alguns minutos: se o cancelamento já tiver sido registrado, o ERP o reconhece.`,
      );
    }
    return this.findOne(empresaId, id);
  }

  /** O XML do evento de cancelamento registrado no Emissor Nacional. */
  async xmlCancelamento(empresaId: string, id: string) {
    const nota = await this.repo.findOne({ where: { id, empresaId }, select: { id: true, chaveAcesso: true, xmlCancelamento: true } });
    if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
    if (!nota.xmlCancelamento) throw new NotFoundException('Esta nota não foi cancelada no Emissor Nacional pelo ERP');
    return { nome: `Cancelamento-NFSe-${nota.chaveAcesso}.xml`, conteudo: nota.xmlCancelamento };
  }

  /** DANFSe: a representação em PDF da NFS-e emitida pelo ERP, montada a partir do XML devolvido pela Sefin. */
  async danfse(empresaId: string, id: string) {
    const nota = await this.repo.findOne({
      where: { id, empresaId },
      select: { id: true, status: true, ambiente: true, numeroNfse: true, chaveAcesso: true, xmlNfse: true },
    });
    if (!nota) throw new NotFoundException(`Nota de serviço ${id} não encontrada`);
    if (!nota.xmlNfse) throw new NotFoundException('Esta nota não foi emitida pelo ERP; o DANFSe dela está no Emissor Nacional');
    const pdf = await gerarPdf(montarDanfse(nota.xmlNfse, { cancelada: nota.status === StatusNotaServico.CANCELADA }));
    return { nome: `DANFSe-${nota.numeroNfse ?? nota.chaveAcesso}.pdf`, conteudo: pdf };
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
