import { handleVercel } from '../../lib/backend/vercel';
import { invalidateCache } from '../../lib/backend/handlers/settings';

export default handleVercel(invalidateCache);
