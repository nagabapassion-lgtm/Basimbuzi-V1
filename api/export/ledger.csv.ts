import { handleVercel } from '../../lib/backend/vercel';
import { exportLedgerCsv } from '../../lib/backend/handlers/misc';

export default handleVercel(exportLedgerCsv);
