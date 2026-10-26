import { DataSource, In } from 'typeorm';
import { Empresa } from '../empresas/empresa.entity';
import { Produto } from '../produtos/produto.entity';
import { Usuario } from '../usuarios/usuario.entity';

/** Empresa (com o logo, que fica fora das consultas comuns) e o nome de quem está gerando o documento. */
export async function contextoDocumento(dataSource: DataSource, empresaId: string, usuarioId: string) {
  const [empresa, usuario] = await Promise.all([
    dataSource
      .getRepository(Empresa)
      .createQueryBuilder('e')
      .addSelect('e.logo')
      .where('e.id = :empresaId', { empresaId })
      .getOneOrFail(),
    dataSource.getRepository(Usuario).findOne({ where: { id: usuarioId }, select: { id: true, nome: true } }),
  ]);
  return { empresa, responsavel: usuario?.nome ?? null };
}

/** Fotos dos produtos (fora das consultas comuns), por id; produto sem foto fica de fora. */
export async function imagensProdutos(dataSource: DataSource, empresaId: string, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const produtos = await dataSource.getRepository(Produto).find({ where: { empresaId, id: In(ids) }, select: { id: true, imagem: true } });
  return new Map(produtos.filter((p) => p.imagem).map((p) => [p.id, p.imagem!]));
}
