import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CentrosCustoService } from '../centros-custo/centros-custo.service';
import { ContasBancariasService } from '../contas-bancarias/contas-bancarias.service';
import { ConfigContas, ContasFinanceirasService } from '../financeiro/contas-financeiras.service';
import { ClientesService } from '../clientes/clientes.service';
import { OrigemMovimentacao, TipoMovimentacao } from '../movimentacoes/movimentacao-bancaria.entity';
import { MovimentacoesService } from '../movimentacoes/movimentacoes.service';
import { TipoPlanoConta } from '../plano-contas/plano-conta.entity';
import { PlanoContasService } from '../plano-contas/plano-contas.service';
import { ContaReceber } from './conta-receber.entity';

const CONFIG: ConfigContas = {
  nome: 'Conta a receber',
  campoPessoa: 'clienteId',
  relacaoPessoa: 'cliente',
  chaveBaixa: 'contaReceberId',
  tipoCategoria: TipoPlanoConta.RECEITA,
  tipoMovimentacao: TipoMovimentacao.ENTRADA,
  origem: OrigemMovimentacao.CONTA_RECEBER,
  verboBaixa: 'Recebimento',
};

@Injectable()
export class ContasReceberService extends ContasFinanceirasService<ContaReceber> {
  constructor(
    dataSource: DataSource,
    @InjectRepository(ContaReceber) repo: Repository<ContaReceber>,
    private readonly clientes: ClientesService,
    planoContas: PlanoContasService,
    centrosCusto: CentrosCustoService,
    contasBancarias: ContasBancariasService,
    movimentacoes: MovimentacoesService,
  ) {
    super(CONFIG, dataSource, repo, planoContas, centrosCusto, contasBancarias, movimentacoes);
  }

  protected validarPessoa(empresaId: string, id: string) {
    return this.clientes.findOne(empresaId, id);
  }
}
