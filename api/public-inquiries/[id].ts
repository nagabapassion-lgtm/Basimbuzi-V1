import { handleVercel } from '../../lib/backend/vercel';
import { updateInquiryStatus } from '../../lib/backend/handlers/publicSite';

export default handleVercel(updateInquiryStatus);
