import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.motorworld.openroad',
  appName: 'MotorWorld Open Road',
  webDir: 'dist',
  android: {
    backgroundColor: '#0a0a0d',
    webContentsDebuggingEnabled: false,
  },
};

export default config;
