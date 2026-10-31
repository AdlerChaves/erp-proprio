import { type CSSVariablesResolver, createTheme, type MantineColorsTuple } from '@mantine/core';

/**
 * Identidade visual do Relda: verde-petróleo escuro como cor da marca e neutros levemente quentes.
 *
 * A escala substitui o "teal" do Mantine, que as telas já usam como cor de valor positivo, selo de sucesso e link;
 * assim tudo fica no mesmo tom, sem trocar cor por cor em cada tela.
 */
const petroleo: MantineColorsTuple = [
  '#eef6f4',
  '#d9ebe7',
  '#b4d7cf',
  '#89bfb4',
  '#5fa69a',
  '#3f8f82',
  '#2a7a6d',
  '#1e675c',
  '#16554c',
  '#0e413a',
];

/** Cinza quente: fundo da aplicação, bordas e textos secundários. */
const cinza: MantineColorsTuple = [
  '#f7f7f5',
  '#f0efec',
  '#e6e4df',
  '#d7d4ce',
  '#b5b1a9',
  '#8f8b82',
  '#6a675f',
  '#4f4c46',
  '#35332f',
  '#22211e',
];

export const tema = createTheme({
  primaryColor: 'teal',
  primaryShade: 7,
  colors: { teal: petroleo, gray: cinza },
  black: '#1d1c19',
  white: '#ffffff',
  defaultRadius: 'sm',
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '12px', xl: '16px' },
  fontFamily: '"IBM Plex Sans Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSizes: { xs: '12px', sm: '13.5px', md: '14.5px', lg: '16px', xl: '18px' },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.5', lg: '1.5', xl: '1.5' },
  headings: {
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '28px', lineHeight: '1.25' },
      h2: { fontSize: '23px', lineHeight: '1.3' },
      h3: { fontSize: '18px', lineHeight: '1.35' },
      h4: { fontSize: '15.5px', lineHeight: '1.4' },
      h5: { fontSize: '14px', lineHeight: '1.4' },
    },
  },
  shadows: {
    xs: '0 1px 2px rgba(29, 28, 25, 0.05)',
    sm: '0 1px 2px rgba(29, 28, 25, 0.06), 0 1px 3px rgba(29, 28, 25, 0.04)',
    md: '0 4px 12px rgba(29, 28, 25, 0.08), 0 1px 3px rgba(29, 28, 25, 0.05)',
    lg: '0 12px 32px rgba(29, 28, 25, 0.12), 0 2px 6px rgba(29, 28, 25, 0.06)',
    xl: '0 20px 48px rgba(29, 28, 25, 0.16)',
  },
  cursorType: 'pointer',
  components: {
    Button: { defaultProps: { radius: 'sm' } },
    Badge: { defaultProps: { radius: 'sm', variant: 'light' } },
    Card: { defaultProps: { radius: 'md' } },
    Paper: { defaultProps: { radius: 'md' } },
    Modal: { defaultProps: { radius: 'md', overlayProps: { backgroundOpacity: 0.32, blur: 2 } } },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.25, blur: 1 } } },
    Menu: { defaultProps: { shadow: 'md', radius: 'md' } },
    Popover: { defaultProps: { shadow: 'md', radius: 'md' } },
    Tooltip: { defaultProps: { radius: 'sm', openDelay: 250 } },
    Table: { defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md' } },
    ActionIcon: { defaultProps: { radius: 'sm' } },
    Notification: { defaultProps: { radius: 'md' } },
  },
});

/** Variáveis de cor usadas pelo estilos.css: fundo da aplicação um tom abaixo do branco, e bordas suaves. */
export const variaveisCss: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-default-border': t.colors.gray[3],
    '--mantine-color-dimmed': t.colors.gray[6],
    '--relda-fundo': t.colors.gray[0],
    '--relda-borda': t.colors.gray[2],
  },
  dark: {},
});
