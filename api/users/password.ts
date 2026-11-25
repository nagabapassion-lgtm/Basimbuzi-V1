import { handleVercel } from '../../lib/backend/vercel';
import { setUserPassword } from '../../lib/backend/handlers/users';

export default handleVercel(setUserPassword);
