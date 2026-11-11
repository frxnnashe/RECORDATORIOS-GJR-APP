import { auth } from '@/lib/server/auth';
import { database } from '@/lib/server/db';
import { errorResponse } from '@/lib/server/http';

async function handle(request: Request) {
  try {
    await database();
    return await auth().handler(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export { handle as GET, handle as POST };

