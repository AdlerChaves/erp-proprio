import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { ConfigContas, ContasFinanceirasService } from '../financeiro/contas-financeiras.service';
import { UpdateContaDto } from '../financeiro/dto/dados-conta.dto';
import { FornecedoresService } from '../fornecedores/fornecedores.service';
import { OrigemMovimentacao, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { ContaPagar } from './conta-pagar.entity';

const CONFIG: ConfigContas = {
  nome: 'Conta a pagar',
  campoPessoa: 'fornecedorId',
  relacaoPessoa: 'fornecedor',
  chaveBaixa: 'contaPagarId',
  tipoCategoria: TipoPlanoConta.DESPESA,
  tipoMovimentacao: TipoMovimentacao.SAIDA,
  origem: OrigemMovimentacao.CONTA_PAGAR,
  verboBaixa: 'Pagamento',
};

@Injectable()
export class ContasPagarService extends ContasFinanceirasService<ContaPagar> {
  constructor(
    dataSource: DataSource,
    @InjectRepository(ContaPagar) repo: Repository<ContaPagar>,
    private readonly fornecedores: FornecedoresService,
    planoContas: PlanoContasService,
    centrosCusto: CentrosCustoService,
    contasBancarias: ContasBancariasService,
    movimentacoes: MovimentacoesService,
  ) {
    super(CONFIG, dataSource, repo, planoContas, centrosCusto, contasBancarias, movimentacoes);
  }

  protected validarPessoa(empresaId: string, id: string) {
    return this.fornecedores.findOne(empresaId, id);
  }

  /** A conta de uma fatura de cartão acompanha os lançamentos do cartão: não é editada nem cancelada aqui. */
  async update(empresaId: string, id: string, dto: UpdateContaDto) {
    await this.recusarSeFatura(empresaId, id);
    return super.update(empresaId, id, dto);
  }

  async cancelar(empresaId: string, id: string) {
    await this.recusarSeFatura(empresaId, id);
    return super.cancelar(empresaId, id);
  }

  private async recusarSeFatura(empresaId: string, id: string) {
    if (await this.repo.exists({ where: { id, empresaId, faturaCartaoId: Not(IsNull()) } })) {
      throw new BadRequestException('Esta conta é a fatura de um cartão de crédito; altere os lançamentos pelo cartão');
    }
  }
}
