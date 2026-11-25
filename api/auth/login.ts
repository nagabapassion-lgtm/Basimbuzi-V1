import { handleVercel } from '../../lib/backend/vercel';
import { login } from '../../lib/backend/handlers/auth';

export default handleVercel(login);
