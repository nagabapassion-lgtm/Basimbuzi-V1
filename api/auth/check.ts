import { handleVercel } from '../../lib/backend/vercel';
import { check } from '../../lib/backend/handlers/auth';

export default handleVercel(check);
