import { handleVercel } from '../../lib/backend/vercel';
import { uploadImage } from '../../lib/backend/handlers/publicSite';

export default handleVercel(uploadImage);
