import { handleVercel } from '../../lib/backend/vercel';
import { sendOtp } from '../../lib/backend/handlers/auth';

export default handleVercel(sendOtp);
