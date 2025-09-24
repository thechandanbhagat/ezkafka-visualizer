import { NextRequest, NextResponse } from 'next/server';
import { 
  KafkaSettings, 
  DEFAULT_SETTINGS, 
  validateSettings, 
  MESSAGE_SIZE_PRESETS,
  MultiServerConfig,
  DEFAULT_MULTI_SERVER_CONFIG,
  createServerProfile,
  addOrUpdateProfile,
  removeProfile,
  getActiveProfile,
  updateProfileLastConnected
} from '@/lib/kafka-settings';
import { getKafkaConnectionManager } from '@/lib/kafka';

// In a real application, you might want to store this in a database
// For now, we'll use in-memory storage (will reset on server restart)
let currentSettings: KafkaSettings = { ...DEFAULT_SETTINGS };
let multiServerConfig: MultiServerConfig = { ...DEFAULT_MULTI_SERVER_CONFIG };

export async function GET() {
  try {
    const manager = getKafkaConnectionManager();
    const activeProfile = getActiveProfile(multiServerConfig);
    
    return NextResponse.json({
      success: true,
      settings: currentSettings,
      multiServerConfig: manager.getConfig(),
      activeProfile,
      presets: {
        messageSizes: MESSAGE_SIZE_PRESETS
      }
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Handle different types of updates
    if (body.action === 'updateProfile') {
      const { profile } = body;
      if (!profile || !profile.id) {
        return NextResponse.json(
          { success: false, error: 'Profile data is required' },
          { status: 400 }
        );
      }
      
      const manager = getKafkaConnectionManager();
      const updatedConfig = addOrUpdateProfile(manager.getConfig(), profile);
      manager.setConfig(updatedConfig);
      multiServerConfig = updatedConfig;
      
      return NextResponse.json({
        success: true,
        message: 'Profile updated successfully',
        multiServerConfig: updatedConfig
      });
    }
    
    if (body.action === 'createProfile') {
      const { name, settings, description } = body;
      if (!name || !settings) {
        return NextResponse.json(
          { success: false, error: 'Profile name and settings are required' },
          { status: 400 }
        );
      }
      
      const newProfile = createServerProfile(name, settings, description);
      const manager = getKafkaConnectionManager();
      const updatedConfig = addOrUpdateProfile(manager.getConfig(), newProfile);
      manager.setConfig(updatedConfig);
      multiServerConfig = updatedConfig;
      
      return NextResponse.json({
        success: true,
        message: 'Profile created successfully',
        profile: newProfile,
        multiServerConfig: updatedConfig
      });
    }
    
    if (body.action === 'deleteProfile') {
      const { profileId } = body;
      if (!profileId) {
        return NextResponse.json(
          { success: false, error: 'Profile ID is required' },
          { status: 400 }
        );
      }
      
      const manager = getKafkaConnectionManager();
      try {
        const updatedConfig = removeProfile(manager.getConfig(), profileId);
        await manager.disconnectProfile(profileId);
        manager.setConfig(updatedConfig);
        multiServerConfig = updatedConfig;
        
        return NextResponse.json({
          success: true,
          message: 'Profile deleted successfully',
          multiServerConfig: updatedConfig
        });
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Failed to delete profile' },
          { status: 400 }
        );
      }
    }
    
    if (body.action === 'switchProfile') {
      const { profileId } = body;
      if (!profileId) {
        return NextResponse.json(
          { success: false, error: 'Profile ID is required' },
          { status: 400 }
        );
      }
      
      const manager = getKafkaConnectionManager();
      try {
        manager.switchActiveProfile(profileId);
        const updatedConfig = updateProfileLastConnected(manager.getConfig(), profileId);
        manager.setConfig(updatedConfig);
        multiServerConfig = updatedConfig;
        
        return NextResponse.json({
          success: true,
          message: 'Profile switched successfully',
          multiServerConfig: updatedConfig,
          activeProfile: getActiveProfile(updatedConfig)
        });
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : 'Failed to switch profile' },
          { status: 400 }
        );
      }
    }
    
    // Legacy settings update
    const newSettings: Partial<KafkaSettings> = body;
    const validatedSettings = validateSettings(newSettings);
    currentSettings = { ...currentSettings, ...validatedSettings };
    
    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
      settings: currentSettings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}

export async function PUT() {
  try {
    // Reset to default multi-server configuration
    const manager = getKafkaConnectionManager();
    await manager.disconnectAll();
    manager.setConfig(DEFAULT_MULTI_SERVER_CONFIG);
    multiServerConfig = { ...DEFAULT_MULTI_SERVER_CONFIG };
    currentSettings = { ...DEFAULT_SETTINGS };
    
    return NextResponse.json({
      success: true,
      message: 'Settings reset to defaults',
      settings: currentSettings,
      multiServerConfig
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset settings' },
      { status: 500 }
    );
  }
}
