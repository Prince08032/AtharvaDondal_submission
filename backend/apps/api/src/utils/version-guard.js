"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withVersionGuard = withVersionGuard;
const graphql_1 = require("graphql");
async function withVersionGuard(supabase, assetId, expectedVersion, userId, operation) {
    // Verify current version and ownership
    const { data: asset, error } = await supabase
        .from('asset')
        .select('version, owner_id')
        .eq('id', assetId)
        .single();
    if (error || !asset) {
        throw new graphql_1.GraphQLError('Asset not found', {
            extensions: { code: 'NOT_FOUND' },
        });
    }
    if (asset.owner_id !== userId) {
        throw new graphql_1.GraphQLError('Not authorized to modify this asset', {
            extensions: { code: 'FORBIDDEN' },
        });
    }
    if (asset.version !== expectedVersion) {
        throw new graphql_1.GraphQLError('Version conflict - asset was modified by another client', {
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
