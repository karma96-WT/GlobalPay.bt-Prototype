// Shared by the browser (live hints) and the server (the real check).
export const PW_RULES: [string, RegExp][] = [
  ['At least 8 characters', /.{8,}/],
  ['At least one uppercase letter (A-Z)', /[A-Z]/],
  ['At least one lowercase letter (a-z)', /[a-z]/],
  ['At least one number (0-9)', /\d/],
  ['At least one symbol (for example ! @ # $)', /[^\w\s]/],
];
export const passwordProblems = (p: string) =>
  PW_RULES.filter(([, r]) => !r.test(p)).map(([t]) => t);
export const EMAIL_RE = /^\S+@\S+\.\S+$/;
/** Bhutan mobile: +975, then 17, 16 or 77, then 6 digits (8 digits after +975). */
export const MOBILE_RE = /^\+975(17|16|77)\d{6}$/;
export const LOCAL_MOBILE_RE = /^(17|16|77)\d{6}$/;
export const fullMobile = (local: string) => '+975' + local.replace(/\D/g, '');
export const CID_RE = /^\d{11}$/;
