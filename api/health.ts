import { handleVercel } from '../lib/backend/vercel';
import { health } from '../lib/backend/handlers/misc';

export default handleVercel(health);
