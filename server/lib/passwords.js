import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;

const COMMON_PASSWORDS = new Set([
  'adhyatmikbharat',
  'admin12345',
  'password12',
  'qwerty1234',
  'sunrise12345',
]);

export const strongPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(200, 'That password is too long.')
  .refine((value) => /[a-z]/.test(value), 'Add a lowercase letter.')
  .refine((value) => /[A-Z]/.test(value), 'Add an uppercase letter.')
  .refine((value) => /\d/.test(value), 'Add a number.')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), 'Choose a password that is not a common guess.');

export function passwordProblems(value) {
  const result = strongPassword.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}
