import { handleVercel } from '../lib/backend/vercel';
import { bootstrap } from '../lib/backend/handlers/misc';

export default handleVercel(bootstrap);
