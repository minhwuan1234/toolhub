export const departments = [
  'Account',
  'Business Development',
  'Production',
  'Project Management',
  'HR',
  'Andy Tran',
  'Marketing',
] as const;
export type Department = (typeof departments)[number];
