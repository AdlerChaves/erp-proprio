import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Coluna, TabelaDados } from './TabelaDados';

interface Conta {
  id: string;
  descricao: string;
  valor: number;
}
const contas: Conta[] = [
  { id: '1', descricao: 'Aluguel novembro', valor: 3200 },
  { id: '2', descricao: 'Honorários contábeis', valor: 650 },
  { id: '3', descricao: 'Internet e telefonia', valor: 389.9 },
];
const colunas: Coluna<Conta>[] = [
  { id: 'descricao', titulo: 'Descrição', celula: (c) => c.descricao, ordenar: (c) => c.descricao },
  { id: 'valor', titulo: 'Valor', celula: (c) => c.valor, ordenar: (c) => c.valor, alinhar: 'right' },
];

function renderizar(props: Partial<Parameters<typeof TabelaDados<Conta>>[0]> = {}) {
  return render(
    <MantineProvider env="test">
      <TabelaDados<Conta>
        linhas={contas}
        colunas={colunas}
        chave={(c) => c.id}
        contagem={['conta', 'contas']}
        textoBusca={(c) => c.descricao}
        placeholderBusca="Buscar conta"
        {...props}
      />
    </MantineProvider>,
  );
}

const descricoes = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('TabelaDados', () => {
  it('busca sem acento e mostra quantas linhas sobraram', async () => {
    renderizar();
    expect(screen.getByText('3 contas')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar conta' }), 'contabeis');
    expect(descricoes()).toEqual(['Honorários contábeis']);
    expect(screen.getByText('1 de 3 contas')).toBeInTheDocument();
  });

  it('busca sem resultado oferece limpar a busca', async () => {
    renderizar();
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar conta' }), 'xyz');
    expect(screen.getByText('Nada encontrado para "xyz".')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Limpar a busca' }).at(-1)!);
    expect(descricoes()).toHaveLength(3);
  });

  it('ordena pela coluna clicada e inverte no segundo clique', async () => {
    renderizar();
    const valor = screen.getByRole('button', { name: 'Valor' });
    await userEvent.click(valor);
    expect(descricoes()).toEqual(['Internet e telefonia', 'Honorários contábeis', 'Aluguel novembro']);
    expect(valor.closest('th')).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(valor);
    expect(descricoes()).toEqual(['Aluguel novembro', 'Honorários contábeis', 'Internet e telefonia']);
    expect(valor.closest('th')).toHaveAttribute('aria-sort', 'descending');
  });

  it('abre a linha pelo clique e pelo Enter, mas não pelas ações da linha', async () => {
    const aoClicarLinha = vi.fn();
    const acao = vi.fn();
    renderizar({ aoClicarLinha, acoes: (c) => <button onClick={acao}>Ações de {c.descricao}</button> });
    await userEvent.click(screen.getByText('Aluguel novembro'));
    expect(aoClicarLinha).toHaveBeenLastCalledWith(contas[0]);

    screen.getAllByRole('row')[2].focus();
    await userEvent.keyboard('{Enter}');
    expect(aoClicarLinha).toHaveBeenLastCalledWith(contas[1]);

    await userEvent.click(screen.getByRole('button', { name: 'Ações de Internet e telefonia' }));
    expect(acao).toHaveBeenCalledOnce();
    expect(aoClicarLinha).toHaveBeenCalledTimes(2);
  });

  it('mostra o estado vazio quando não há linhas e esqueleto enquanto carrega', () => {
    const { rerender } = renderizar({ linhas: [], vazio: <p>Cadastre a primeira conta.</p> });
    expect(screen.getByText('Cadastre a primeira conta.')).toBeInTheDocument();
    rerender(
      <MantineProvider env="test">
        <TabelaDados<Conta> linhas={undefined} colunas={colunas} chave={(c) => c.id} contagem={['conta', 'contas']} />
      </MantineProvider>,
    );
    expect(screen.getByLabelText('Carregando')).toBeInTheDocument();
  });

  it('erro mostra a mensagem e o botão de tentar de novo', async () => {
    const aoTentarDeNovo = vi.fn();
    renderizar({ erro: new Error('Falha de rede'), aoTentarDeNovo });
    expect(screen.getByText('Falha de rede')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentarDeNovo).toHaveBeenCalledOnce();
  });
});
