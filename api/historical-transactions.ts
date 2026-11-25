import { handleVercel } from '../lib/backend/vercel';
import { historicalTransactions } from '../lib/backend/handlers/transactions';

export default handleVercel(historicalTransactions);
