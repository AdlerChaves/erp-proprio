import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// Com a suíte inteira rodando em paralelo (jsdom + Mantine), uma máquina lenta passa do 1 s padrão do waitFor/findBy.
configure({ asyncUtilTimeout: 4000 });

// O jsdom não implementa estas APIs, que o Mantine usa.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverFalso as unknown as typeof ResizeObserver;
