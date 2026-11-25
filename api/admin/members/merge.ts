import { handleVercel } from '../../../lib/backend/vercel';
import { mergeMembers } from '../../../lib/backend/handlers/members';

export default handleVercel(mergeMembers);
