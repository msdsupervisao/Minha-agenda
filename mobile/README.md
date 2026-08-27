# Minha Agenda para Android

Aplicativo complementar da Agenda. A interface fica empacotada no APK; a mensagem
é transferida pelo site por um código temporário, salva em uma notificação local e
aberta no WhatsApp somente após o toque do usuário.

## Preparar o projeto

Requisitos: Node.js 22+, Android Studio 2025.2.1+ e Android SDK API 36.

```powershell
cd mobile
npm install
# Opção 1: copie .env.example para .env.local e ajuste a URL.
# Opção 2: defina a variável somente nesta sessão.
$env:VITE_API_BASE = 'https://seu-ambiente-de-teste.example'
npm run open:android
```

O comando compila o bundle, sincroniza os plugins e abre `mobile/android` no
Android Studio. No primeiro uso, aguarde o Gradle terminar de baixar as
dependências. `VITE_API_BASE` é obrigatória e deve apontar explicitamente para o
mesmo ambiente web/Supabase usado no teste; não use a URL de produção no piloto.

## Testar no celular

1. Ative as opções do desenvolvedor e a depuração USB no Android.
2. Conecte o aparelho e aceite a autorização de depuração.
3. No Android Studio, selecione o aparelho e pressione **Run**.
4. Autorize notificações e, quando solicitado, **Alarmes e lembretes**.
5. Na Agenda, use: `Mande no grupo dos pais amanhã às 9 dizendo que teremos reunião.`
6. Confirme no site e aceite a abertura do aplicativo. Ao receber o deep link, o
   app agenda imediatamente; só solicitará a permissão de notificações se faltar.

No horário, a notificação mostra apenas um aviso genérico. Por restrição de segurança
do Android/WhatsApp, ela não envia nem abre uma conversa sem interação: ao tocá-la, o
texto é entregue ao WhatsApp e o usuário ainda escolhe o grupo e confirma o envio.

## Gerar APK

Durante o piloto, use **Build > Generate App Bundles or APKs > Generate APKs** no
Android Studio. O APK de depuração fica em `android/app/build/outputs/apk/debug/`.
Para distribuição, gere um APK de release assinado e guarde a chave fora do Git.
