import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from './api/cliente';
import { rotas } from './rotas';
import { SessaoProvider } from './sessao/sessao';
import { tema } from './tema';

dayjs.locale('pt-br');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erros de permissão ou validação não melhoram tentando de novo.
      retry: (tentativas, erro) => !(erro instanceof ApiError && erro.status < 500) && tentativas < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={tema}>
      <DatesProvider settings={{ locale: 'pt-br', firstDayOfWeek: 0 }}>
        <Notifications position="top-right" />
        <QueryClientProvider client={queryClient}>
          <SessaoProvider>
            <RouterProvider router={rotas} />
          </SessaoProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>,
);
