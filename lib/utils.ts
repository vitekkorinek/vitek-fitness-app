export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'No sessions yet';

  const diffMs   = Date.now() - new Date(dateStr).getTime();
  const diffHours = diffMs / 3_600_000;
  const diffDays  = diffMs / 86_400_000;

  if (diffHours < 1)  return 'Just now';
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffDays  < 14) {
    const d = Math.floor(diffDays);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }

  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function isInactiveClient(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return (Date.now() - new Date(dateStr).getTime()) / 86_400_000 >= 14;
}

export function nameInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
