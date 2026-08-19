import { interpretCommand } from './interpreter';
import type { ActionInterpreter } from './types';

export class LocalActionInterpreter implements ActionInterpreter {
  async interpret(text: string) {
    const action = interpretCommand(text);
    if (action) { action.interpretedBy = 'local'; action.confidence = 1; }
    return { action, provider: 'local' as const, notice: 'Modo local ativo.' };
  }
}
