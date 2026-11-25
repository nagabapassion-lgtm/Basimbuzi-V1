import { handleVercel } from '../../lib/backend/vercel';
import { meUpdateProfile } from '../../lib/backend/handlers/me';

export default handleVercel(meUpdateProfile);
