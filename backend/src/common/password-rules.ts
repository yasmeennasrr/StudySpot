/**
 * Password rules, shared by registration, the staff:create script and the Staff
 * Console (PB-33). Each returns a readable problem, or null when the password is fine.
 */

/** Student passwords (SDS 6.6.6): at least 8 characters with a letter and a digit. */
export function userPasswordProblem(password: string): string | null {
  return passwordProblem(password, 8);
}

/** Staff passwords: at least 10 characters with a letter and a digit. */
export function staffPasswordProblem(password: string): string | null {
  return passwordProblem(password, 10);
}

function passwordProblem(password: string, minLength: number): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters.`;
  if (password.length > 128) return 'Use at most 128 characters.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/\d/.test(password)) return 'Include at least one digit.';
  return null;
}
