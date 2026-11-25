import { handleVercel } from '../../lib/backend/vercel';
import { verifyOtpHandler } from '../../lib/backend/handlers/auth';

export default handleVercel(verifyOtpHandler);
