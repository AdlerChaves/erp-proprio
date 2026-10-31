import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { cifraConfigurada, cifrar } from '../../common/cifra';
import { FUSO } from '../../common/datas';
import { validarImagem } from '../../common/imagem';
import { abrirCertificado, CertificadoA1, CertificadoInvalidoError } from '../nfse/certificado';
import { criarPlanoPadrao } from '../plano-contas/plano-padrao';
import { Perfil } from '../usuarios/perfil.enum';
import { UsuarioEmpresa } from '../usuarios/usuario-empresa.entity';
import { CertificadoDto } from './dto/certificado.dto';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { Empresa } from './empresa.entity';

const DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO });
const formatarCnpj = (cnpj: string) => cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

@Injectable()
export class EmpresasService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Empresa) private readonly repo: Repository<Empresa>,
  ) {}

  async findOne(id: string) {
    const empresa = await this.repo.findOneBy({ id });
    if (!empresa) throw new NotFoundException(`Empresa ${id} não encontrada`);
    return empresa;
  }

  async update(id: string, dto: UpdateEmpresaDto) {
    if (dto.nfseSerie && Number(dto.nfseSerie) > 49999) {
      throw new BadRequestException('A série da DPS para aplicativo próprio vai de 1 a 49999');
    }
    if (dto.proposta && dto.proposta.parcelasSemJuros > dto.proposta.parcelasCartao) {
      throw new BadRequestException('As parcelas sem juros não podem passar do máximo de parcelas no cartão');
    }
    const empresa = await this.findOne(id);
    return this.repo.save(this.repo.merge(empresa, dto));
  }

  async logo(id: string) {
    const empresa = await this.repo.findOne({ where: { id }, select: { id: true, logo: true } });
    if (!empresa) throw new NotFoundException(`Empresa ${id} não encontrada`);
    return { logo: empresa.logo ?? null };
  }

  async definirLogo(id: string, imagem: string) {
    validarImagem(imagem, 'o logo');
    await this.findOne(id);
    await this.repo.update(id, { logo: imagem });
    return { logo: imagem };
  }

  async removerLogo(id: string) {
    await this.findOne(id);
    await this.repo.update(id, { logo: null });
  }

  /**
   * Instala o certificado A1 usado para assinar e transmitir a NFS-e. Confere a senha, se é o e-CNPJ desta
   * empresa (mesma raiz de CNPJ, que vale para matriz e filiais) e se está no prazo; guarda o arquivo cifrado.
   */
  async definirCertificado(id: string, dto: CertificadoDto) {
    if (!cifraConfigurada()) {
      throw new ServiceUnavailableException('O servidor ainda não tem a chave para guardar certificados (CHAVE_CERTIFICADOS no .env)');
    }
    const empresa = await this.findOne(id);
    let certificado: CertificadoA1;
    try {
      certificado = abrirCertificado(Buffer.from(dto.certificado, 'base64'), dto.senha);
    } catch (erro) {
      if (erro instanceof CertificadoInvalidoError) throw new BadRequestException(erro.message);
      throw erro;
    }
    if (!certificado.cnpj) {
      throw new BadRequestException('Este certificado não é um e-CNPJ; use o certificado A1 da empresa');
    }
    if (certificado.cnpj.slice(0, 8) !== empresa.cnpj.slice(0, 8)) {
      throw new BadRequestException(`O certificado é do CNPJ ${formatarCnpj(certificado.cnpj)}, e a empresa é ${formatarCnpj(empresa.cnpj)}`);
    }
    const agora = new Date();
    if (certificado.validoAte < agora) throw new BadRequestException(`O certificado venceu em ${DATA.format(certificado.validoAte)}`);
    if (certificado.validoDe > agora) throw new BadRequestException(`O certificado só vale a partir de ${DATA.format(certificado.validoDe)}`);

    await this.repo.update(id, {
      certificadoCifrado: cifrar(JSON.stringify({ pfx: dto.certificado, senha: dto.senha })),
      certificadoTitular: certificado.titular.slice(0, 255),
      certificadoValidade: certificado.validoAte,
    });
    return this.findOne(id);
  }

  async removerCertificado(id: string) {
    await this.findOne(id);
    await this.repo.update(id, { certificadoCifrado: null, certificadoTitular: null, certificadoValidade: null });
  }

  /** Cria a empresa com o plano de contas padrão e torna o usuário seu administrador. */
  criarParaUsuario(usuarioId: string, dto: CreateEmpresaDto) {
    return this.dataSource.transaction(async (m) => {
      if (await m.existsBy(Empresa, { cnpj: dto.cnpj })) {
        throw new ConflictException(`Já existe empresa com CNPJ ${dto.cnpj}`);
      }
      const empresa = await m.save(m.create(Empresa, dto));
      await criarPlanoPadrao(m, empresa.id);
      await m.save(m.create(UsuarioEmpresa, { usuarioId, empresaId: empresa.id, perfil: Perfil.ADMIN }));
      return empresa;
    });
  }
}
