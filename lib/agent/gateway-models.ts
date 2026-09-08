export type GatewayModelPreset = {
  slug: string;
  label: string;
  description: string;
  bestFor: string;
};

export const RECOMMENDED_GATEWAY_MODELS: GatewayModelPreset[] = [
  {
    slug: 'gemini/gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    description: 'Baixa latência, bom para o fluxo principal e tool calling já validado.',
    bestFor: 'Operação estável e resposta rápida.',
  },
  {
    slug: 'groq/openai/gpt-oss-20b',
    label: 'Groq GPT-OSS 20B',
    description: 'Fallback explícito com boa capacidade de raciocínio e boa latência.',
    bestFor: 'Continuidade quando o primário falhar ou ficar indisponível.',
  },
];
