"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const query_1 = require("./query");
const mutation_1 = require("./mutation");
exports.resolvers = {
    Query: query_1.Query,
    Mutation: mutation_1.Mutation,
};
