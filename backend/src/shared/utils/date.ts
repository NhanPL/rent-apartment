export const firstDayOfMonth = (value?: string): string => {
  const date = value ? new Date(value) : new Date();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return utc.toISOString().slice(0, 10);
};
