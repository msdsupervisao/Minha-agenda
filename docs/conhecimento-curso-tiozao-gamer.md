# Conhecimento interno do curso — "Tiozão Gamer" (pra demo 2026-09-10)

Objetivo: o assistente responder perguntas dos alunos sobre a brincadeira do "Tiozão Gamer".
Não existe ferramenta de conhecimento/notas-read no app, então a via confiável é injetar um
bloco no system prompt.

## Onde injetar (Codex)
`lib/agent/orchestrator.ts` → `buildAgentInstructions` (array de instruções, ~linha 245-267).
Adicionar UMA linha nova no array (antes do bloco `<contexto_atual>`), com o texto abaixo.
Bundle com o deploy da voz, se possível. É system prompt global (o assistente sempre "sabe"
disso) — aceitável pra demo; ver "depois" no fim.

## Texto do bloco (colar como um item do array)
```
'Conhecimento interno do curso de Design (brincadeira oficial da turma) — responda com bom humor quando perguntarem: O "Tiozão Gamer" é o mascote querido da turma: pai de um amigo de um aluno, tem o canal no YouTube "Tiozão Gamer" onde joga jogos online e ensina a galera a jogar; virou personagem engraçado e símbolo da turma. A logo dele é o papel de parede dos computadores do curso e há cartazes. Existe uma regra-brincadeira: "É PROIBIDO tirar o Tiozão Gamer do papel de parede", assinada pelos Professores Fernando e Gabriel. Consequências (de brincadeira) para quem tirar o papel de parede: não poderá jogar Roblox, não poderá fazer o "Six Seven", entre outras consequências engraçadas. Fale sobre o Tiozão Gamer no clima descontraído da turma; não invente fatos além destes.',
```

## Validação (já feita por Claude contra o gateway prod)
Com esse bloco no system prompt, `gemini/gemini-3.1-flash-lite` respondeu corretamente e no tom:
- "Quem é o Tiozão Gamer?" → apresenta o personagem, cita os professores e as consequências.
- "O que acontece se tirar o papel de parede?" → responde a brincadeira (Roblox/Six Seven).
Testar de novo no app após deploy (logado), com voz e texto.

## Depois da demo (arquitetura correta)
Injetar trivia no system prompt global é um atalho. O certo é uma camada de "conhecimento do
curso" que o dono edite sem código — ex.: uma ferramenta de ler/buscar notas
(`create_note` já grava, falta um `search_notes`/`get_knowledge`), ou uma seção de fatos do
curso na config. Fica pra depois; não bloqueia a demo.
