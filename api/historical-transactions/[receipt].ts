import { handleVercel } from '../../lib/backend/vercel';
import { deleteTransaction } from '../../lib/backend/handlers/transactions';

// Legacy alias kept for the pre-migration client: DELETE /api/historical-transactions/:receiptNumber
export default handleVercel(deleteTransaction);
