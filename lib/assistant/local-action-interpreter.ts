import { interpretCommand } from './interpreter';
import { appTimezone } from '../data/time';
import type { ActionInterpreter } from './types';

export class LocalActionInterpreter implements ActionInterpreter {
  constructor(private timezone = appTimezone()) {}

  async interpret(text: string) {
    const action = interpretCommand(text, new Date(), this.timezone);
    if (action) { action.interpretedBy = 'local'; action.confidence = 1; }
    return { action, provider: 'local' as const, notice: 'Modo local ativo.' };
  }
}
