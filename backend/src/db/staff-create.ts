/**
 * Creates a staff account, or gives an existing account a staff role (PB-32).
 * This is how the first administrator is made on Supabase; after that, PB-33 lets
 * administrators create staff from the Staff Console.
 *
 *   npm --prefix backend run staff:create -- admin you@aucegypt.edu "Your Name"
 *   npm --prefix backend run staff:create -- moderator someone@aucegypt.edu "Their Name"
 *
 * Asks for the password without showing it. Uses DATABASE_URL from backend/.env.
 *
 * Git Bash (mintty) does not give Node a real terminal, so the prompt cannot work
 * there. Use PowerShell, or read the password into a variable first (not saved in
 * the shell history):
 *   read -rs -p "Password: " STAFF_PASSWORD; echo; export STAFF_PASSWORD
 *   npm --prefix backend run staff:create -- admin you@aucegypt.edu "Your Name"; unset STAFF_PASSWORD
 */
import { createInterface } from 'node:readline';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import { UserEntity } from './entities';

const ROLES = ['admin', 'moderator'] as const;
type StaffRole = (typeof ROLES)[number];

/** Staff passwords: at least 10 characters with a letter and a digit. */
export function staffPasswordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 128) return 'Use at most 128 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/\d/.test(password)) return 'Include at least one digit.';
  return null;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as {
      _writeToOutput: (s: string) => void;
      output: NodeJS.WriteStream;
    };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const [role, emailArg, ...nameParts] = process.argv.slice(2);
  if (!ROLES.includes(role as StaffRole) || !emailArg) {
    console.error('Usage: npm run staff:create -- <admin|moderator> <e-mail> "<Display name>"');
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const displayName = (nameParts.join(' ') || email.split('@')[0]).slice(0, 30);

  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(UserEntity);
    const existing = await users.findOne({ where: { email } });
    if (existing) {
      await users.update({ id: existing.id }, { role: role as StaffRole });
      console.log(`${email} is now ${role}. Their password is unchanged.`);
      return;
    }
    const fromEnv = process.env.STAFF_PASSWORD;
    if (!fromEnv && !process.stdin.isTTY) {
      console.error(
        'This window cannot ask for a password (Git Bash). Run the command in PowerShell, or set\n' +
          'STAFF_PASSWORD first:  read -rs -p "Password: " STAFF_PASSWORD; echo; export STAFF_PASSWORD',
      );
      process.exitCode = 1;
      return;
    }
    const password = fromEnv ?? (await askHidden('Password for the new staff account: '));
    const problem = staffPasswordProblem(password);
    if (problem) {
      console.error(problem);
      process.exitCode = 1;
      return;
    }
    if (!fromEnv && (await askHidden('Type it again: ')) !== password) {
      console.error('The passwords do not match.');
      process.exitCode = 1;
      return;
    }
    await users.save(
      users.create({
        email,
        displayName,
        role: role as StaffRole,
        passwordHash: await bcrypt.hash(password, 12),
        termsAcceptedAt: new Date(),
      }),
    );
    console.log(`Created ${role} ${email}. Sign in at <server>/console.`);
  } finally {
    await dataSource.destroy();
  }
}

/** A readable reason. Node on Windows reports a refused connection as an AggregateError with no message. */
export function describeError(err: unknown): string {
  const inner = err instanceof AggregateError ? err.errors : [err];
  const parts = inner.map((e) => {
    const x = e as { code?: string; message?: string; address?: string; port?: number };
    return x.code === 'ECONNREFUSED'
      ? `connection refused at ${x.address ?? 'the database host'}:${x.port ?? ''}`
      : x.message || x.code || String(e);
  });
  const text = [...new Set(parts)].join('; ') || 'unknown error';
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').host || 'not set';
    } catch {
      return 'not a valid URL';
    }
  })();
  return (
    `Could not create the staff account: ${text}.\n` +
    `DATABASE_URL in backend/.env points to ${host}. For Supabase use the Session pooler URI ` +
    `and DATABASE_SSL=true; for the local database, start Docker first (npm run db:up).`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(describeError(err));
    process.exit(1);
  });
}
