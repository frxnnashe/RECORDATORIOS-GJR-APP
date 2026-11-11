import { createHash, randomBytes } from 'node:crypto';
import { database } from '@/lib/server/db';
import { errorResponse, requestUser } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    const user = await requestUser(request, true);
    const token = randomBytes(32).toString('base64url');
    const { widget } = await database();
    await widget.updateOne(
      { ownerId: user.id },
      { $set: { tokenHash: createHash('sha256').update(token).digest('hex'), createdAt: new Date() } },
      { upsert: true },
    );
    return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requestUser(request, true);
    const { widget } = await database();
    await widget.deleteOne({ ownerId: user.id });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

