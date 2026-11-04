export function passwordError(password: string): string | null {
  if (password.length < 7) return "Password must be at least 7 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-z]/.test(password)) return "Password needs at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password needs at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs at least one number.";
  return null;
}
