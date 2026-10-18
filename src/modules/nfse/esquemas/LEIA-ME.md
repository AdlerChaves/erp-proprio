Esquemas XSD oficiais da NFS-e nacional, versão 1.01 (pacote `nfse-esquemas_xsd-v1-01-20260209.zip`),
baixados de https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual sem alteração.
Só os arquivos usados pela DPS foram copiados.
O padrão da série em `tiposSimples_v1.01.xsd` usa `^` e `$`, que em XSD são caracteres literais; `dps.ts` corrige isso
na leitura, sem alterar o arquivo. Ao atualizar, troque a pasta inteira e rode os testes.

Os dados em `../dados` vêm dos anexos da mesma página: municípios (Anexo A, TAB.MUN_IBGE) e a lista
nacional de serviços com o código de tributação nacional de 6 dígitos (Anexo I, aba MUN.INCID_INFO.SERV.).
