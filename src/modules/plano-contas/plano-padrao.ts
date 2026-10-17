import { EntityManager } from 'typeorm';
import { PlanoConta, TipoPlanoConta } from './plano-conta.entity';

/**
 * Plano de contas criado para toda empresa nova. A raiz 1 é de receitas e a 2 de despesas;
 * contas com subcontas na lista viram sintéticas automaticamente.
 */
const PLANO_PADRAO: [codigo: string, nome: string][] = [
  ['1', 'Receitas'],
  ['1.01', 'Venda de produtos'],
  ['1.02', 'Prestação de serviços'],
  ['1.03', 'Receitas financeiras'],
  ['1.04', 'Outras receitas'],
  ['2', 'Despesas'],
  ['2.01', 'Custos'],
  ['2.01.01', 'Compras de mercadorias e matéria-prima'],
  ['2.01.02', 'Fretes sobre compras'],
  ['2.02', 'Pessoal'],
  ['2.02.01', 'Salários e encargos'],
  ['2.02.02', 'Pró-labore'],
  ['2.02.03', 'Benefícios'],
  ['2.03', 'Administrativas'],
  ['2.03.01', 'Aluguel e condomínio'],
  ['2.03.02', 'Água, energia e internet'],
  ['2.03.03', 'Contabilidade e serviços de terceiros'],
  ['2.03.04', 'Material de escritório'],
  ['2.03.05', 'Sistemas e softwares'],
  ['2.04', 'Comerciais'],
  ['2.04.01', 'Marketing e publicidade'],
  ['2.04.02', 'Comissões sobre vendas'],
  ['2.05', 'Impostos e taxas'],
  ['2.05.01', 'Impostos sobre vendas'],
  ['2.05.02', 'Taxas e licenças'],
  ['2.06', 'Despesas financeiras'],
  ['2.06.01', 'Tarifas bancárias'],
  ['2.06.02', 'Juros e multas pagos'],
];

const codigoPai = (codigo: string) =>
  codigo.includes('.') ? codigo.slice(0, codigo.lastIndexOf('.')) : null;

/** Cria o plano padrão dentro da transação de criação da empresa. */
export async function criarPlanoPadrao(m: EntityManager, empresaId: string) {
  const sinteticas = new Set(PLANO_PADRAO.map(([codigo]) => codigoPai(codigo)));
  const ids = new Map<string, string>();
  for (const [codigo, nome] of PLANO_PADRAO) {
    const pai = codigoPai(codigo);
    const conta = await m.save(
      m.create(PlanoConta, {
        empresaId,
        codigo,
        nome,
        tipo: codigo.startsWith('1') ? TipoPlanoConta.RECEITA : TipoPlanoConta.DESPESA,
        contaPaiId: pai ? ids.get(pai) : null,
        aceitaLancamento: !sinteticas.has(codigo),
      }),
    );
    ids.set(codigo, conta.id);
  }
}
