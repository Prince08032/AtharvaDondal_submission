import { GraphQLError } from 'graphql';
import { SupabaseClient } from '@supabase/supabase-js';

export async function withVersionGuard<T>(
  supabase: SupabaseClient,
  assetId: string,
  expectedVersion: number,
  userId: string,
  operation: () => Promise<T>
): Promise<T> {
  // Verify current version and ownership
  const { data: asset, error } = await supabase
    .from('asset')
    .select('version, owner_id')
    .eq('id', assetId)
    .single();

  if (error || !asset) {
    throw new GraphQLError('Asset not found', {
      extensions: { code: 'NOT_FOUND' },
    });
  }

  if (asset.owner_id !== userId) {
    throw new GraphQLError('Not authorized to modify this asset', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  if (asset.version !== expectedVersion) {
    throw new GraphQLError('Version conflict - asset was modified by another client', {
      extensions: {
        code: 'VERSION_CONFLICT',
        currentVersion: asset.version,
        expectedVersion,
      },
    });
  }

  // Execute the operation
  return operation();
}
