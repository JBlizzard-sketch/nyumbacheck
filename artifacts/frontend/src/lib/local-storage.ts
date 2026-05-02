const REPORTS_KEY = "nyumbacheck_reports";

type ReportEntry = {
  id: number;
  email: string;
  submittedAt: string;
};

export function addReportToLocalStorage(email: string, id: number): void {
  try {
    const existing = getReportsFromLocalStorage();
    const updated = [
      { id, email, submittedAt: new Date().toISOString() },
      ...existing.filter((r) => r.id !== id),
    ].slice(0, 50);
    localStorage.setItem(REPORTS_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable
  }
}

export function getReportsFromLocalStorage(email?: string): ReportEntry[] {
  try {
    const raw = localStorage.getItem(REPORTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReportEntry[];
    if (email) return parsed.filter((r) => r.email === email);
    return parsed;
  } catch {
    return [];
  }
}

export function clearReportsFromLocalStorage(): void {
  try {
    localStorage.removeItem(REPORTS_KEY);
  } catch {
    // ignore
  }
}
