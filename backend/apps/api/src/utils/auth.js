"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupabaseAdminClient = createSupabaseAdminClient;
exports.createSupabaseUserClient = createSupabaseUserClient;
exports.getAuthenticatedUser = getAuthenticatedUser;
exports.requireAuth = requireAuth;
const supabase_js_1 = require("@supabase/supabase-js");
const graphql_1 = require("graphql");
// Admin client with service role (bypasses RLS)
function createSupabaseAdminClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
// User client with their JWT token (respects RLS)
function createSupabaseUserClient(token) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
async function getAuthenticatedUser(authHeader, supabase) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.replace('Bearer ', '');
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return null;
        }
        return user;
    }
    catch (error) {
        console.error('Auth error:', error);
        return null;
    }
}
function requireAuth(user) {
    if (!user) {
        throw new graphql_1.GraphQLError('Authentication required', {
            extensions: { code: 'UNAUTHENTICATED' },
        });
    }
    return user;
}
