import { handleVercel } from '../../lib/backend/vercel';
import { meVerifyCode } from '../../lib/backend/handlers/me';

export default handleVercel(meVerifyCode);
