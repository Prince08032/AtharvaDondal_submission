"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_yoga_1 = require("graphql-yoga");
const http_1 = require("http");
const resolvers_1 = require("./resolvers");
const schema_1 = require("./schemas/schema");
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = require("./utils/auth");
dotenv_1.default.config();
const yoga = (0, graphql_yoga_1.createYoga)({
    schema: (0, graphql_yoga_1.createSchema)({
        typeDefs: schema_1.typeDefs,
        resolvers: resolvers_1.resolvers,
    }),
    context: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        const supabaseAdmin = (0, auth_1.createSupabaseAdminClient)();
        let user = null;
        let supabaseUser = null;
        if (authHeader) {
            user = await (0, auth_1.getAuthenticatedUser)(authHeader, supabaseAdmin);
            if (user) {
                const token = authHeader.replace("Bearer ", "");
                supabaseUser = (0, auth_1.createSupabaseUserClient)(token);
            }
        }
        return {
            supabaseAdmin, // For admin operations (storage, edge functions)
            supabaseUser, // For database operations (respects RLS)
            user,
            request,
        };
    },
    cors: {
        origin: [
            "https://web-gmiw.onrender.com",
            "http://localhost:3000",
        ],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Accept",
            "Origin",
            "X-Requested-With",
            "apollo-require-preflight",
            "x-user-id",
        ],
        // credentials: true, // Uncomment if you need cookies/auth headers
    },
    graphqlEndpoint: "/graphql",
    landingPage: false,
});
const server = (0, http_1.createServer)(yoga);
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`🚀 GraphQL API server running on http://localhost:${PORT}/graphql`);
    console.log(`📊 GraphiQL available at http://localhost:${PORT}/graphql`);
});
