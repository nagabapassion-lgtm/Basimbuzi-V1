import { handleVercel } from '../../lib/backend/vercel';
import { deleteTransaction } from '../../lib/backend/handlers/transactions';

export default handleVercel(deleteTransaction);
