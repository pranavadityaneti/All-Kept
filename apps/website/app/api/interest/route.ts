import { getD1 } from '../../../db';

const GOAL = 500;
const LAUNCH_DATE = '2026-09-21';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getCount() {
  const result = await getD1()
    .prepare('SELECT COUNT(*) AS count FROM waitlist_interests')
    .first<{ count: number }>();

  return Number(result?.count ?? 0);
}

export async function GET() {
  return Response.json({
    count: await getCount(),
    goal: GOAL,
    launchDate: LAUNCH_DATE,
  });
}

export async function POST(request: Request) {
  let body: { email?: unknown; website?: unknown };

  try {
    body = (await request.json()) as { email?: unknown; website?: unknown };
  } catch {
    return Response.json(
      { message: 'Send a valid email address.' },
      { status: 400 },
    );
  }

  if (typeof body.website === 'string' && body.website.trim()) {
    return Response.json({
      count: await getCount(),
      goal: GOAL,
      joined: true,
      message: 'You’re in. We’ll let you know first.',
    });
  }

  if (typeof body.email !== 'string') {
    return Response.json(
      { message: 'Send a valid email address.' },
      { status: 400 },
    );
  }

  const email = body.email.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return Response.json(
      { message: 'Send a valid email address.' },
      { status: 400 },
    );
  }

  const result = await getD1()
    .prepare(
      'INSERT OR IGNORE INTO waitlist_interests (email, created_at) VALUES (?, ?)',
    )
    .bind(email, new Date().toISOString())
    .run();
  const joined = (result.meta.changes ?? 0) > 0;

  return Response.json({
    count: await getCount(),
    goal: GOAL,
    joined,
    message: joined
      ? 'You’re in. We’ll let you know first.'
      : 'You’re already on the list.',
  });
}
