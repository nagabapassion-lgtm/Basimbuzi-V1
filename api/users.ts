import { handleVercel } from '../lib/backend/vercel';
import { deleteUser, listUsers, patchUserStatus, upsertUsers } from '../lib/backend/handlers/users';

export default handleVercel(async ctx => {
  switch (ctx.method) {
    case 'POST':
      return upsertUsers(ctx);
    case 'PATCH':
      return patchUserStatus(ctx);
    case 'DELETE':
      return deleteUser(ctx);
    default:
      return listUsers(ctx);
  }
});
