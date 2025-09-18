import { NextRequest, NextResponse } from 'next/server';
import { KafkaSettings, DEFAULT_SETTINGS, validateSettings, MESSAGE_SIZE_PRESETS } from '@/lib/kafka-settings';

// In a real application, you might want to store this in a database
// For now, we'll use in-memory storage (will reset on server restart)
let currentSettings: KafkaSettings = { ...DEFAULT_SETTINGS };

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      settings: currentSettings,
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
    const newSettings: Partial<KafkaSettings> = await request.json();
    
    // Validate settings
    const validatedSettings = validateSettings(newSettings);
    
    // Update current settings
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
    // Reset to default settings
    currentSettings = { ...DEFAULT_SETTINGS };
    
    return NextResponse.json({
      success: true,
      message: 'Settings reset to defaults',
      settings: currentSettings
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reset settings' },
      { status: 500 }
    );
  }
}
