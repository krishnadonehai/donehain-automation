
export function validateISODate(iso: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid date format: ${iso}`);
  }

  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== iso
  ) {
    throw new Error(`Invalid date: ${iso}`);
  }
}

export function displayDate(iso: string): string {
  validateISODate(iso);

  const [year, month, day] = iso.split('-').map(Number);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return `${String(day).padStart(2, '0')}-${months[month - 1]}-${year}`;
}

export function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find(part => part.type === type)?.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function daysBefore(iso: string, days: number): string {
  validateISODate(iso);

  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}
