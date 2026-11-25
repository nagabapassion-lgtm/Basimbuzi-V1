import { handleVercel } from '../../../../lib/backend/vercel';
import { claimLink } from '../../../../lib/backend/handlers/members';

export default handleVercel(claimLink);
