/** Verify a Clerk session JWT; returns Clerk user id (sub) or throws. */
async function verifyClerkBearer(token) {
  if (!process.env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY not set');
  const { verifyToken } = require('@clerk/backend');
  const payload = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });
  if (!payload.sub) throw new Error('no sub');
  return payload.sub;
}

module.exports = { verifyClerkBearer };
