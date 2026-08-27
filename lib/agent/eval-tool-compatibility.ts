export type EvalToolCompatibility = {
  status: 'implemented' | 'partially_implemented' | 'planned' | 'intentionally_blocked';
  runtimeTools: readonly string[];
  note: string;
};

export const EVAL_TOOL_COMPATIBILITY = {
  open_application: planned('Requer executor Windows e verificação de processo/janela.'),
  close_application: planned('Requer executor Windows e confirmação quando houver trabalho não salvo.'),
  focus_application: planned('Requer inspeção confiável da janela ativa.'),
  open_file: planned('Requer busca, resolução de ambiguidade e verificação do aplicativo aberto.'),
  search_files: planned('Requer índice de arquivos; não representa consultas à agenda.'),
  create_file: planned('Requer política de sobrescrita e verificação no sistema de arquivos.'),
  move_file: planned('Requer confirmação, alvo absoluto validado e verificação de origem/destino.'),
  copy_file: planned('Requer confirmação somente em conflito/sobrescrita e verificação do destino.'),
  delete_file: planned('Requer confirmação obrigatória e preferência por exclusão recuperável.'),
  open_url: planned('Requer integração com navegador e verificação da aba carregada.'),
  search_web: planned('Requer provedor de busca e atribuição de fontes.'),
  execute_command: planned('Requer confirmação do comando exato, allowlist e isolamento.'),
  get_system_info: planned('Requer adaptador de leitura do Windows.'),
  get_time: planned('Pode usar relógio do contexto, mas ainda não é uma ferramenta registrada.'),
  get_date: planned('Pode usar relógio do contexto, mas ainda não é uma ferramenta registrada.'),
  set_volume: planned('Requer executor Windows e leitura posterior do volume.'),
  get_volume: planned('Requer adaptador de leitura do volume.'),
  take_screenshot: planned('Requer captura local e política de privacidade.'),
  read_clipboard: planned('Requer acesso local com proteção para conteúdo sensível.'),
  write_clipboard: planned('Requer acesso local e verificação por releitura.'),
  resolve_recipient: implemented(['find_classes'], 'Resolve candidatos somente contra turmas reais cadastradas.'),
  load_notice_model: implemented(['get_notice_template'], 'Carrega o modelo pelo UUID real da turma e número validado.'),
  prepare_whatsapp_message: planned('Requer contrato de rascunho separado de envio.'),
  schedule_whatsapp_message: partial(['prepare_notice_schedule', 'get_schedule_status'], 'Cria handoff confirmado e consulta o ACK; a execução final ainda depende do aplicativo Android.'),
  send_whatsapp_message: planned('Requer confirmação de destinatário/corpo/canal e evidência honesta do envio.'),
  financial_action: blocked('Ações financeiras permanecem fora do piloto até existir política crítica específica.'),
} as const satisfies Record<string, EvalToolCompatibility>;

export type ConceptualEvalToolName = keyof typeof EVAL_TOOL_COMPATIBILITY;

export const EVAL_KNOWN_GAPS = [
  {
    code: 'memory_mutation_without_tool',
    caseIds: ['mem-56', 'mem-57', 'mem-58', 'mem-59'],
    note: 'Os cenários exigem persistência ou esquecimento, mas não declaram uma ferramenta de memória.',
  },
  {
    code: 'agenda_query_mapped_to_file_search',
    caseIds: ['read-68'],
    note: 'Consulta de agenda exige ferramenta de domínio; search_files não fornece essa evidência.',
  },
  {
    code: 'alternative_outcome_encoded_as_single_expectation',
    caseIds: ['msg-tecnologia-ambiguo-34'],
    note: 'A observação aceita resolver ou perguntar, mas o esperado fixa ferramentas e pergunta simultaneamente.',
  },
] as const;

export function missingCompatibilityEntries(toolNames: readonly string[]) {
  return toolNames.filter((toolName) => !(toolName in EVAL_TOOL_COMPATIBILITY));
}

function planned(note: string): EvalToolCompatibility {
  return { status: 'planned', runtimeTools: [], note };
}

function implemented(runtimeTools: readonly string[], note: string): EvalToolCompatibility {
  return { status: 'implemented', runtimeTools, note };
}

function blocked(note: string): EvalToolCompatibility {
  return { status: 'intentionally_blocked', runtimeTools: [], note };
}

function partial(runtimeTools: readonly string[], note: string): EvalToolCompatibility {
  return { status: 'partially_implemented', runtimeTools, note };
}
