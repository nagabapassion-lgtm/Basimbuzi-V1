import { handleVercel } from '../../lib/backend/vercel';
import { meSendCode } from '../../lib/backend/handlers/me';

export default handleVercel(meSendCode);
