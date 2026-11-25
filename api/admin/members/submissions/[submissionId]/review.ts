import { handleVercel } from '../../../../../lib/backend/vercel';
import { reviewSubmission } from '../../../../../lib/backend/handlers/members';

export default handleVercel(reviewSubmission);
