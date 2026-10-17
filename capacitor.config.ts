import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.caredose.app',
  appName: 'CareDose',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_medication',
      iconColor: '#0F766E',
      sound: 'beep.wav'
    }
  }
};

export default config;
