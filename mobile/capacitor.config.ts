import type { CapacitorConfig } from '@capacitor/cli';

// App estático (webDir = dist). NÃO usamos server.url: a Agenda continua no site;
// este app só agenda a notificação e abre o WhatsApp. Ver /api/schedule/redeem.
const config: CapacitorConfig = {
  appId: 'com.minhaagenda.app',
  appName: 'Minha Agenda',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#2563eb',
    },
  },
};

export default config;
