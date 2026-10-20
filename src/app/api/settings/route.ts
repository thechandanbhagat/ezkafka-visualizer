import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MESSAGE_SIZE_PRESETS, type MultiServerConfig } from '@/lib/kafka-settings';
import { getKafkaConnectionManager, KafkaOperationError } from '@/lib/kafka';
import { createInitialKafkaConfig, getStoredKafkaConfig, updateStoredKafkaConfig } from '@/services/kafka-config-store';
import { ConfigValidationError, parseKafkaProfile, requireObject, requireProfileId } from '@/utils/kafka-config-validation';

// @group APIEndpoints > Settings : Durable profile configuration shared by all server processes
function configResponse(config: MultiServerConfig) {
  const activeProfile = config.profiles.find(profile => profile.id === config.activeProfileId)!;
  return NextResponse.json({ success: true, multiServerConfig: config, activeProfile, settings: activeProfile.settings, presets: { messageSizes: MESSAGE_SIZE_PRESETS } });
}

function settingsError(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ success: false, error: 'Request must contain valid JSON.' }, { status: 400 });
  if (error instanceof ConfigValidationError) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (error instanceof KafkaOperationError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  return NextResponse.json({ success: false, error: 'Unable to access cluster configuration. Check the configured storage location and permissions.' }, { status: 500 });
}

export async function GET() {
  try { return configResponse(await getStoredKafkaConfig()); }
  catch (error) { return settingsError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = requireObject(await request.json());
    const action = body.action;
    if (typeof action !== 'string' || !['createProfile', 'updateProfile', 'deleteProfile', 'switchProfile'].includes(action)) throw new ConfigValidationError('Unknown settings action.');
    const profile = action === 'createProfile'
      ? parseKafkaProfile({ id: randomUUID(), name: body.name, settings: body.settings, description: body.description })
      : action === 'updateProfile' ? parseKafkaProfile(body.profile) : null;
    const profileId = profile?.id ?? requireProfileId(body.profileId);
    const config = await updateStoredKafkaConfig(current => {
      const existing = current.profiles.find(item => item.id === profileId);
      if (action !== 'createProfile' && !existing) throw new KafkaOperationError('Cluster profile was not found.', 404);
      if (action === 'createProfile') return { ...current, profiles: [...current.profiles, profile!] };
      if (action === 'updateProfile') return { ...current, profiles: current.profiles.map(item => item.id === profileId ? profile! : item) };
      if (action === 'deleteProfile') {
        if (current.profiles.length === 1) throw new KafkaOperationError('The last cluster profile cannot be deleted.', 409);
        const profiles = current.profiles.filter(item => item.id !== profileId);
        return { profiles, activeProfileId: current.activeProfileId === profileId ? profiles[0].id : current.activeProfileId };
      }
      return { ...current, activeProfileId: profileId };
    });
    await getKafkaConnectionManager().refreshConfig();
    return configResponse(config);
  } catch (error) { return settingsError(error); }
}

export async function PUT() {
  try {
    const config = await updateStoredKafkaConfig(() => createInitialKafkaConfig());
    await getKafkaConnectionManager().refreshConfig();
    return configResponse(config);
  } catch (error) { return settingsError(error); }
}
