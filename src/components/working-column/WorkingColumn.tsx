import type { ReactNode } from 'react';
import { BoardColumn, type DropState } from '../ui/BoardColumn';

interface Props {
  count: number;
  dropState: DropState;
  dropMessage: string;
  children: ReactNode;
}

/** Tabela/quadro de profissionais em atendimento. */
export function WorkingColumn({ count, dropState, dropMessage, children }: Props) {
  return (
    <BoardColumn
      zoneId="zone-working"
      title="TRABALHANDO"
      subtitle="Em atendimento"
      count={count}
      accent="work"
      dropState={dropState}
      dropMessage={dropMessage}
      emptyMessage="Nenhum atendimento em andamento"
    >
      {children}
    </BoardColumn>
  );
}
