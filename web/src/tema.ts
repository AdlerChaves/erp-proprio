import { type CSSVariablesResolver, createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Identidade visual do Relda, direção "livro-caixa preciso": tinta sobre papel branco, linhas finas organizando
 * a informação, o verde-petróleo da marca só no que é ação ou navegação, e cor de estado (vermelho, âmbar) só
 * no que pede atenção. Dinheiro saindo não é vermelho; vencido e negativo, sim.
 *
 * A escala substitui o "teal" do Mantine, que as telas já usam como cor de valor positivo, selo de sucesso e link;
 * assim tudo fica no mesmo tom, sem trocar cor por cor em cada tela.
 */
const petroleo: MantineColorsTuple = [
  '#e6f1ee',
  '#d3e7e2',
  '#a9d0c7',
  '#7db8aa',
  '#57a191',
  '#3f8f82',
  '#2a7a6d',
  '#1e675c',
  '#154c44',
  '#0e3b35',
];

/** Neutro com leve viés para o petróleo: fundo do menu, bordas e textos secundários. */
const cinza: MantineColorsTuple = [
  '#f4f6f5',
  '#eef1f0',
  '#e2e7e5',
  '#cfd7d4',
  '#aab5b2',
  '#7b8784',
  '#55615e',
  '#3d4845',
  '#28312f',
  '#17201e',
];

/** Atenção: o que pede conferência ou cobrança, sem ser crítico. Tom 7 = #A8570A. */
const ambar: MantineColorsTuple = [
  '#fdf5ea',
  '#fbe8cf',
  '#f5cf9c',
  '#eeb466',
  '#e79b39',
  '#d7841e',
  '#c06e10',
  '#a8570a',
  '#8a4708',
  '#6b3706',
];

export const tema = createTheme({
  primaryColor: 'teal',
  primaryShade: 7,
  colors: { teal: petroleo, gray: cinza, ambar },
  black: '#17201e',
  white: '#ffffff',
  defaultRadius: 'sm',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '20px', xl: '28px' },
  fontFamily: '"IBM Plex Sans Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSizes: { xs: '12px', sm: '13.5px', md: '14px', lg: '16px', xl: '20px' },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.5', lg: '1.5', xl: '1.4' },
  headings: {
    fontWeight: '600',
    sizes: {
      // Título da tela (Cabecalho), título de bloco, título de seção.
      h1: { fontSize: '20px', lineHeight: '1.3' },
      h2: { fontSize: '20px', lineHeight: '1.3' },
      h3: { fontSize: '16px', lineHeight: '1.4' },
      h4: { fontSize: '14.5px', lineHeight: '1.4' },
      h5: { fontSize: '14px', lineHeight: '1.4' },
    },
  },
  // Sombra só no que flutua sobre a tela: menus, modais e avisos.
  shadows: {
    xs: '0 1px 2px rgba(23, 32, 30, 0.05)',
    sm: '0 1px 2px rgba(23, 32, 30, 0.06), 0 1px 3px rgba(23, 32, 30, 0.04)',
    md: '0 4px 12px rgba(23, 32, 30, 0.08), 0 1px 3px rgba(23, 32, 30, 0.05)',
    lg: '0 12px 32px rgba(23, 32, 30, 0.12), 0 2px 6px rgba(23, 32, 30, 0.06)',
    xl: '0 20px 48px rgba(23, 32, 30, 0.16)',
  },
  cursorType: 'pointer',
  components: {
    Button: { defaultProps: { radius: 'sm' } },
    Badge: { defaultProps: { radius: 'xs', variant: 'light' } },
    Card: { defaultProps: { radius: 'md' } },
    Paper: { defaultProps: { radius: 'md' } },
    Modal: { defaultProps: { radius: 'lg', overlayProps: { backgroundOpacity: 0.32, blur: 2 } } },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.25, blur: 1 } } },
    Menu: { defaultProps: { shadow: 'md', radius: 'md' } },
    Popover: { defaultProps: { shadow: 'md', radius: 'md' } },
    Tooltip: { defaultProps: { radius: 'sm', openDelay: 250 } },
    // Linhas de 40 px: 10 px acima e abaixo de um texto de 13,5 px.
    Table: { defaultProps: { verticalSpacing: 10, horizontalSpacing: 'md' } },
    ActionIcon: { defaultProps: { radius: 'sm' } },
    Notification: { defaultProps: { radius: 'md' } },
    SegmentedControl: { defaultProps: { radius: 'sm', size: 'xs' } },
  },
});

/** Variáveis de cor usadas pelo estilos.css e pelos módulos CSS. */
export const variaveisCss: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-default-border': t.colors.gray[3],
    '--mantine-color-dimmed': t.colors.gray[6],
    '--relda-fundo': t.colors.gray[0],
    '--relda-borda': t.colors.gray[2],
    '--relda-borda-forte': t.colors.gray[3],
    '--relda-critico': t.colors.red[9],
    '--relda-critico-fundo': '#fdecec',
    '--relda-atencao': t.colors.ambar[7],
    '--relda-atencao-fundo': t.colors.ambar[0],
  },
  dark: {},
});
