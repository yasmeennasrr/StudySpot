/**
 * Account management rules (PB-33, FR-036 to FR-038, FR-044) without a database.
 * TC-M4-24, TC-M4-25. The HTTP and database path is in test/int/staff-accounts.int-spec.ts.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '../../src/common/events/domain-events';
import { staffPasswordProblem, userPasswordProblem } from '../../src/common/password-rules';
import { AdminService } from '../../src/modules/admin/admin.service';

const ADMIN_ID = '00000000-0000-4000-8000-0000000000a1';
const STUDENT_ID = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-21T10:00:00Z');

describe('AdminService accounts', () => {
  const users = {
    exists: jest.fn(),
    create: jest.fn((x: object) => x),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const txQuery = jest.fn();
  const db = {
    transaction: (work: (tx: { query: typeof txQuery }) => unknown) => work({ query: txQuery }),
  };
  const events = new EventEmitter2();
  const emitted: { action: string; target: string; details?: Record<string, unknown> }[] = [];
  events.on(DomainEvent.StaffAction, (e) => emitted.push(e));
  const service = new AdminService(
    users as never,
    db as never,
    { invalidate: jest.fn() } as never,
    { now: () => NOW },
    events,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    emitted.length = 0;
    users.save.mockImplementation(async (u: object) => ({
      id: 'new-id',
      createdAt: NOW,
      suspended: false,
      ...u,
    }));
  });

  it('TC-M4-24 creates accounts with the password rule of their role, refuses a used e-mail, and logs the action', async () => {
    // Boundaries: students 8 characters, staff 10; a letter and a digit for both.
    expect(userPasswordProblem('abcdefg1')).toBeNull();
    expect(userPasswordProblem('abcdef1')).toBe('Use at least 8 characters.');
    expect(staffPasswordProblem('abcdefgh1')).toBe('Use at least 10 characters.');
    expect(staffPasswordProblem('abcdefghi1')).toBeNull();
    expect(userPasswordProblem('12345678')).toBe('Include at least one letter.');

    users.exists.mockResolvedValue(false);
    const base = {
      email: '  New.Mod@AUCEgypt.edu ',
      displayName: ' New Mod ',
      role: 'moderator' as const,
    };
    await expect(
      service.createAccount(ADMIN_ID, { ...base, password: 'abcdefg1' }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: 'Please check password: Use at least 10 characters.',
    });
    const created = await service.createAccount(ADMIN_ID, { ...base, password: 'abcdefghi1' });
    expect(created).toMatchObject({
      id: 'new-id',
      email: 'new.mod@aucegypt.edu',
      displayName: 'New Mod',
      role: 'moderator',
      suspended: false,
    });
    const saved = users.save.mock.calls[0][0] as { passwordHash: string; termsAcceptedAt: Date };
    expect(saved.passwordHash).not.toContain('abcdefghi1');
    expect(saved.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(saved.termsAcceptedAt).toEqual(NOW);
    expect(emitted).toEqual([
      expect.objectContaining({
        action: 'account.created',
        target: 'new.mod@aucegypt.edu',
        details: { userId: 'new-id', role: 'moderator' },
      }),
    ]);

    // A student account needs only 8 characters.
    await service.createAccount(ADMIN_ID, { ...base, role: 'user', password: 'abcdefg1' });

    users.exists.mockResolvedValue(true);
    await expect(
      service.createAccount(ADMIN_ID, { ...base, password: 'abcdefghi1' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('TC-M4-25 suspends another account and ends its sessions, never one’s own; repeats change nothing', async () => {
    await expect(service.suspendUser(ADMIN_ID, ADMIN_ID)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    users.findOne.mockResolvedValue(null);
    await expect(service.suspendUser(ADMIN_ID, STUDENT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const student = {
      id: STUDENT_ID,
      email: 'dev@studyspot.test',
      displayName: 'Dev',
      role: 'user',
      suspended: false,
      createdAt: NOW,
    };
    users.findOne.mockResolvedValue(student);
    txQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('UPDATE sessions') ? [[], 2] : [[], 1],
    );
    const suspended = await service.suspendUser(ADMIN_ID, STUDENT_ID);
    expect(suspended.suspended).toBe(true);
    expect(txQuery.mock.calls.map((c) => c[0])).toEqual([
      'UPDATE users SET suspended = true WHERE id = $1',
      'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
    ]);
    expect(emitted.at(-1)).toMatchObject({
      action: 'account.suspended',
      target: 'dev@studyspot.test',
      details: { userId: STUDENT_ID, role: 'user', sessionsEnded: 2 },
    });

    // Already suspended: nothing written, nothing logged.
    users.findOne.mockResolvedValue({ ...student, suspended: true });
    txQuery.mockClear();
    emitted.length = 0;
    await service.suspendUser(ADMIN_ID, STUDENT_ID);
    expect(txQuery).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);

    const active = await service.reactivateUser(ADMIN_ID, STUDENT_ID);
    expect(active.suspended).toBe(false);
    expect(users.update).toHaveBeenCalledWith({ id: STUDENT_ID }, { suspended: false });
    expect(emitted.at(-1)).toMatchObject({ action: 'account.reactivated' });
  });
});
