import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { municipio, municipioPorNome } from '../nfse/catalogos';

/** Endereço do CEP no formato do cadastro. Número e complemento nenhuma fonte informa. */
export interface DadosCep {
  cep: string;
  /** Vazio em CEP geral de município (um CEP para a cidade inteira). */
  logradouro: string;
  bairro: string;
  /** Código IBGE, só se o município existir na tabela da NFS-e. */
  codigoMunicipio: string | null;
  municipio: { nome: string; uf: string } | null;
  fonte: string;
}

interface RespostaViaCep {
  erro?: boolean | string;
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
}

interface RespostaBrasilApi {
  cep?: string;
  street?: string | null;
  neighborhood?: string | null;
  city?: string;
  state?: string;
  ibge?: { city?: string | null } | null;
}

const vazio = (v: string | null | undefined) => (v ?? '').trim();
class NaoEncontrado extends Error {}

/** Fontes gratuitas, na ordem de tentativa. Sem o código IBGE na resposta, o município sai do nome da cidade e da UF. */
export const FONTES_CEP = [
  {
    nome: 'ViaCEP',
    url: (cep: string) => `https://viacep.com.br/ws/${cep}/json/`,
    converter: (r: RespostaViaCep) => {
      // CEP com formato válido, mas inexistente, volta 200 com { "erro": true } (ou "true").
      if (r.erro === true || r.erro === 'true') throw new NaoEncontrado();
      return { logradouro: r.logradouro, bairro: r.bairro, cidade: r.localidade, uf: r.uf, ibge: r.ibge };
    },
  },
  {
    nome: 'BrasilAPI',
    url: (cep: string) => `https://brasilapi.com.br/api/cep/v2/${cep}`,
    converter: (r: RespostaBrasilApi) => ({ logradouro: r.street, bairro: r.neighborhood, cidade: r.city, uf: r.state, ibge: r.ibge?.city ?? null }),
  },
];

const TEMPO_LIMITE_MS = 6_000;
/** CEPs quase nunca mudam; um mês de cache poupa as fontes gratuitas. */
const VALIDADE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const MAXIMO_CACHE = 5_000;

@Injectable()
export class ConsultaCepService {
  private readonly logger = new Logger(ConsultaCepService.name);
  private readonly cache = new Map<string, { dados: DadosCep; expiraEm: number }>();

  async consultar(cepInformado: string): Promise<DadosCep> {
    const cep = cepInformado.replace(/\D/g, '');
    if (cep.length !== 8 || /^0+$/.test(cep)) throw new BadRequestException('CEP inválido: são 8 dígitos');

    const guardado = this.cache.get(cep);
    if (guardado && guardado.expiraEm > Date.now()) return guardado.dados;

    // Uma base pode não ter um CEP novo que a outra tem: só é "não encontrado" se nenhuma achar.
    let algumaRespondeu = false;
    for (const fonte of FONTES_CEP) {
      try {
        const r = await this.buscar(fonte.url(cep));
        const e = fonte.converter(r as never);
        const cidade = (e.ibge && municipio(e.ibge)) || (e.cidade && e.uf ? municipioPorNome(e.cidade, e.uf) : undefined);
        const dados: DadosCep = {
          cep,
          logradouro: vazio(e.logradouro),
          bairro: vazio(e.bairro),
          codigoMunicipio: cidade ? cidade.codigo : null,
          municipio: cidade ? { nome: cidade.nome, uf: cidade.uf } : e.cidade ? { nome: vazio(e.cidade), uf: vazio(e.uf) } : null,
          fonte: fonte.nome,
        };
        this.guardar(cep, dados);
        return dados;
      } catch (erro) {
        if (erro instanceof NaoEncontrado) {
          algumaRespondeu = true;
          continue;
        }
        this.logger.warn(`Consulta de CEP em ${fonte.nome} falhou: ${(erro as Error).message}`);
      }
    }
    if (algumaRespondeu) throw new NotFoundException(`CEP ${cep.replace(/(\d{5})(\d{3})/, '$1-$2')} não encontrado`);
    throw new ServiceUnavailableException('A consulta de CEP está indisponível no momento; preencha o endereço manualmente');
  }

  private async buscar(url: string): Promise<unknown> {
    const resposta = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'relda-erp' },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (resposta.status === 404) throw new NaoEncontrado();
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados: unknown = await resposta.json();
    if (!dados || typeof dados !== 'object') throw new Error('resposta inválida');
    return dados;
  }

  private guardar(cep: string, dados: DadosCep) {
    // Map mantém a ordem de inserção: ao lotar, descarta a consulta mais antiga.
    if (this.cache.size >= MAXIMO_CACHE) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(cep, { dados, expiraEm: Date.now() + VALIDADE_CACHE_MS });
  }
}
