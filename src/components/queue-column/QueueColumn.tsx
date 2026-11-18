import type { ReactNode } from 'react';
import { BoardColumn, type DropState } from '../ui/BoardColumn';

interface Props {
  count: number;
  dropState: DropState;
  dropMessage: string;
  children: ReactNode;
}

/** Tabela/quadro da fila de espera. */
export function QueueColumn({ count, dropState, dropMessage, children }: Props) {
  return (
    <BoardColumn
      zoneId="zone-queue"
      title="NA FILA"
      subtitle="Ordem de espera"
      count={count}
      accent="queue"
      dropState={dropState}
      dropMessage={dropMessage}
      emptyMessage="Nenhum profissional na fila"
    >
      {children}
    </BoardColumn>
  );
}
