import { query, withTransaction } from '../../db';

// Contract-specific persistence gateway. Named repository functions are added
// here as contract workflows are extracted from the orchestration service.
export const contractQuery = query;
export const withContractTransaction = withTransaction;
