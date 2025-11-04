import { createYoga, createSchema } from "graphql-yoga";
import { createServer } from "http";
import { resolvers } from "./resolvers";
import { typeDefs } from "./schemas/schema";
import dotenv from "dotenv";
import {
  createSupabaseAdminClient,
  createSupabaseUserClient,
  getAuthenticatedUser,
} from "./utils/auth";
import { GraphQLContext } from "./context";

dotenv.config();

const yoga = createYoga<GraphQLContext>({
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  context: async ({ request }): Promise<GraphQLContext> => {
    const authHeader = request.headers.get("authorization");
    const supabaseAdmin = createSupabaseAdminClient();

    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const user = await getAuthenticatedUser(authHeader, supabaseAdmin);
    if (!user) {
      throw new Error('Authentication failed');
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createSupabaseUserClient(token);

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

const server = createServer(yoga);
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 GraphQL API server running on http://localhost:${PORT}/graphql`);
  console.log(`📊 GraphiQL available at http://localhost:${PORT}/graphql`);
});
