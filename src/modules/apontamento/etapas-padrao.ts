import { EntityManager } from 'typeorm';
import { EtapaPadrao } from './etapa-padrao.entity';

/** Etapas criadas para toda empresa nova; o cadastro "Etapas padrão" permite mudar, incluir e reordenar. */
export const ETAPAS_PADRAO = ['Levantamento', 'Orçamento aprovado', 'Compra de material', 'Infraestrutura', 'Fiação e quadros', 'Testes e entrega'];

/** Cria as etapas padrão dentro da transação de criação da empresa. */
export async function criarEtapasPadrao(m: EntityManager, empresaId: string) {
  await m.save(ETAPAS_PADRAO.map((nome, i) => m.create(EtapaPadrao, { empresaId, nome, ordem: i + 1 })));
}
