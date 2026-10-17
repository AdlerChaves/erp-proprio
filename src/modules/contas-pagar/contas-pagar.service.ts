import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { ConfigContas, ContasFinanceirasService } from '../financeiro/contas-financeiras.service';
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
}
