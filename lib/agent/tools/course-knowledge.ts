import { z } from 'zod';
import type { AgentTool, JsonObject } from '../contracts';

export function createCourseKnowledgeTools(): AgentTool<JsonObject>[] {
  return [{
    name: 'get_course_knowledge', risk: 'read',
    description: 'Consulta informações do Tiozão Gamer SOMENTE quando o usuário perguntar sobre ele ou continuar diretamente esse assunto. Perguntas genéricas sobre YouTube, jogos, vídeos e canais não autorizam essa consulta.',
    inputSchema: z.object({ topic: z.literal('tiozao_gamer') }).strict(),
    async execute() {
      return {
        source: 'Conhecimento fornecido pelo dono do curso',
        facts: 'O Tiozão Gamer é o mascote querido da turma de Design: pai de um amigo de um aluno, tem o canal no YouTube Tiozão Gamer onde joga jogos online e ensina a galera a jogar. A logo dele é o papel de parede dos computadores e há cartazes. A regra-brincadeira de não tirar o papel de parede é assinada pelos professores Fernando e Gabriel. As consequências de brincadeira são não jogar Roblox e não fazer o Six Seven.',
        limits: 'As consequências são brincadeira, nunca punições reais. Não há definição de Six Seven nestes dados. Não invente fatos, links nem associações a outros assuntos.',
      };
    },
  }];
}
