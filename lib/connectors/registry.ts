import { PlatformConnector } from './types';
import { InstagramConnector } from './instagram';
import { TikTokConnector } from './tiktok';

export class ConnectorRegistry {
  private static instance: ConnectorRegistry;
  private connectors: Map<string, PlatformConnector> = new Map();

  private constructor() {
    this.connectors.set('instagram', new InstagramConnector());
    this.connectors.set('tiktok', new TikTokConnector());
  }

  public static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }

  public getConnector(platform: 'instagram' | 'tiktok'): PlatformConnector {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new Error(`Unsupported platform connector: ${platform}`);
    }
    return connector;
  }
}
