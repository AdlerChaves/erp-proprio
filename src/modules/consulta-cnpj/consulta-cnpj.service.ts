import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { documentoValido } from '../../common/documento';
import { municipio } from '../nfse/catalogos';

/** Dados do CNPJ já no formato do ERP, prontos para preencher o cadastro. */
export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  /** Como a Receita informa: ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA. */
  situacao: string;
  ativa: boolean;
  email: string | null;
  telefone: string | null;
  /** Campos vazios na Receita vêm vazios aqui; o município só vem se existir na tabela do IBGE da NFS-e. */
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    codigoMunicipio: string | null;
  };
  municipio: { nome: string; uf: string } | null;
  simplesNacional: boolean | null;
  mei: boolean | null;
  fonte: string;
  consultadoEm: string;
}

/** Formato da BrasilAPI, igual ao da Minha Receita (que é a fonte dela). */
interface RespostaReceita {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  descricao_situacao_cadastral?: string | null;
  descricao_tipo_de_logradouro?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  codigo_municipio_ibge?: number | null;
  municipio?: string | null;
  uf?: string | null;
  ddd_telefone_1?: string | null;
  email?: string | null;
  opcao_pelo_simples?: boolean | null;
  opcao_pelo_mei?: boolean | null;
}

/** Fontes gratuitas dos dados abertos da Receita, na ordem de tentativa. */
export const FONTES = [
  { nome: 'BrasilAPI', url: (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}` },
  { nome: 'Minha Receita', url: (cnpj: string) => `https://minhareceita.org/${cnpj}` },
];

const TEMPO_LIMITE_MS = 8_000;
/** Os dados abertos da Receita são atualizados uma vez por mês; uma semana de cache poupa as fontes gratuitas. */
const VALIDADE_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const MAXIMO_CACHE = 2_000;

const vazio = (v: string | null | undefined) => (v ?? '').trim();
class NaoEncontrado extends Error {}

@Injectable()
export class ConsultaCnpjService {
  private readonly logger = new Logger(ConsultaCnpjService.name);
  private readonly cache = new Map<string, { dados: DadosCnpj; expiraEm: number }>();

  async consultar(cnpjInformado: string): Promise<DadosCnpj> {
    const cnpj = cnpjInformado.replace(/\D/g, '');
    if (cnpj.length !== 14 || !documentoValido(cnpj)) throw new BadRequestException('CNPJ inválido');

    const guardado = this.cache.get(cnpj);
    if (guardado && guardado.expiraEm > Date.now()) return guardado.dados;

    for (const fonte of FONTES) {
      try {
        const dados = this.converter(await this.buscar(fonte.url(cnpj)), fonte.nome);
        this.guardar(cnpj, dados);
        return dados;
      } catch (erro) {
        if (erro instanceof NaoEncontrado) throw new NotFoundException('CNPJ não encontrado na Receita Federal');
        this.logger.warn(`Consulta de CNPJ em ${fonte.nome} falhou: ${(erro as Error).message}`);
      }
    }
    throw new ServiceUnavailableException('A consulta de CNPJ está indisponível no momento; preencha os dados manualmente');
  }

  private async buscar(url: string): Promise<RespostaReceita> {
    const resposta = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'relda-erp' },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (resposta.status === 404) throw new NaoEncontrado();
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = (await resposta.json()) as RespostaReceita;
    if (!dados?.razao_social) throw new Error('resposta sem razão social');
    return dados;
  }

  private converter(r: RespostaReceita, fonte: string): DadosCnpj {
    const codigoIbge = r.codigo_municipio_ibge ? String(r.codigo_municipio_ibge) : null;
    const cidade = codigoIbge ? municipio(codigoIbge) : undefined;
    const tipo = vazio(r.descricao_tipo_de_logradouro);
    const rua = vazio(r.logradouro);
    // A Receita guarda o tipo (RUA, AVENIDA) separado; junta, a menos que o nome já o contenha ("SAUN QUADRA 5").
    // O texto fica em maiúsculas, como na Receita: converter estragaria siglas e números romanos.
    const jaTemTipo = !tipo || rua.toUpperCase().split(/\s+/).includes(tipo.toUpperCase());
    const logradouro = rua && !jaTemTipo ? `${tipo} ${rua}` : rua;
    const numero = vazio(r.numero);
    const situacao = vazio(r.descricao_situacao_cadastral).toUpperCase() || 'DESCONHECIDA';
    const telefone = vazio(r.ddd_telefone_1).replace(/\D/g, '');
    return {
      cnpj: r.cnpj.replace(/\D/g, ''),
      razaoSocial: vazio(r.razao_social),
      nomeFantasia: vazio(r.nome_fantasia) || null,
      situacao,
      ativa: situacao === 'ATIVA',
      email: vazio(r.email).toLowerCase() || null,
      telefone: telefone.length >= 10 ? telefone : null,
      endereco: {
        cep: vazio(r.cep).replace(/\D/g, ''),
        logradouro,
        numero: numero.toUpperCase() === 'SN' ? 'S/N' : numero,
        complemento: vazio(r.complemento),
        bairro: vazio(r.bairro),
        codigoMunicipio: cidade ? cidade.codigo : null,
      },
      municipio: cidade ? { nome: cidade.nome, uf: cidade.uf } : r.municipio ? { nome: vazio(r.municipio), uf: vazio(r.uf) } : null,
      simplesNacional: r.opcao_pelo_simples ?? null,
      mei: r.opcao_pelo_mei ?? null,
      fonte,
      consultadoEm: new Date().toISOString(),
    };
  }

  private guardar(cnpj: string, dados: DadosCnpj) {
    // Map mantém a ordem de inserção: ao lotar, descarta a consulta mais antiga.
    if (this.cache.size >= MAXIMO_CACHE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(cnpj, { dados, expiraEm: Date.now() + VALIDADE_CACHE_MS });
  }
}
