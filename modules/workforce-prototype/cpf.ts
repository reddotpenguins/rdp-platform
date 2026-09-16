/** Private-sector Ordinary Wages only. CPF Board tables effective 1 Jan 2026.
 * https://www.cpf.gov.sg/content/dam/web/employer/employer-obligations/documents/CPFcontributionratesfrom1Jan2026.pdf
 * Amounts are integer cents; rounding applies once per employee/calendar month.
 */
export type CpfProfile = {
  birthMonth: string;
  residency: 'citizen' | 'pr' | 'foreign';
  prSince: string;
  election: 'GG' | 'FG' | 'FF';
};
export type CpfResult = {
  error: string | null; grossCents: number; assessableCents: number;
  employeeCents: number; employerCents: number; totalCents: number;
  netCents: number; costCents: number; employerRate: number; employeeRate: number;
  band: string; basis: string;
};
export const CPF_SOURCE = 'https://www.cpf.gov.sg/employer/employer-obligations/how-much-cpf-contributions-to-pay';
const bands = ['55 and below', 'Above 55–60', 'Above 60–65', 'Above 65–70', 'Above 70'];
const fullEmployer = [1700, 1600, 1250, 900, 750];
const fullEmployee = [2000, 1800, 1250, 750, 500];
const pr1Employer = [400, 400, 350, 350, 350];
const pr2Employer = [900, 600, 350, 350, 350];
const pr2Employee = [1500, 1250, 750, 500, 500];
const validMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const monthNumber = (s: string) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
export function calculateCpf(month: string, grossCents: number, profile: CpfProfile): CpfResult {
  const result: CpfResult = {error:null, grossCents, assessableCents:0, employeeCents:0, employerCents:0, totalCents:0, netCents:grossCents, costCents:grossCents, employerRate:0, employeeRate:0, band:'', basis:''};
  const fail = (error: string) => ({...result, error});
  if (!validMonth(month) || !month.startsWith('2026-')) return fail('Only the 2026 CPF tables are implemented. Select a month in 2026.');
  if (!Number.isSafeInteger(grossCents) || grossCents < 0 || grossCents > 100000000) return fail('Enter valid, non-negative monthly Ordinary Wages (up to $1 million).');
  if (!['citizen','pr','foreign'].includes(profile.residency)) return fail('Select the CPF residency status.');
  if (profile.residency === 'foreign') return {...result, basis:'Non-SC / non-PR · no CPF'};
  if (!validMonth(profile.birthMonth) || profile.birthMonth >= month) return fail('Enter a valid birth month before the contribution month.');
  const ageMonths = monthNumber(month) - monthNumber(profile.birthMonth);
  // A new contribution age band starts in the month AFTER the birthday month.
  const bandIndex = ageMonths <= 55*12 ? 0 : ageMonths <= 60*12 ? 1 : ageMonths <= 65*12 ? 2 : ageMonths <= 70*12 ? 3 : 4;
  let employerBps = fullEmployer[bandIndex], employeeBps = fullEmployee[bandIndex];
  let basis = 'Singapore citizen · full rates';
  if (profile.residency === 'pr') {
    const prMonth = profile.prSince.slice(0,7);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.prSince) || !validMonth(prMonth) || !Number.isFinite(Date.parse(profile.prSince+'T12:00:00Z')) || new Date(profile.prSince+'T12:00:00Z').toISOString().slice(0,10)!==profile.prSince || prMonth > month) return fail('Enter a valid PR conversion date on or before this month.');
    if (prMonth === month) return fail('PR conversion month needs a review of wages earned from the conversion date.');
    const elapsed = monthNumber(month) - monthNumber(prMonth);
    const year = elapsed <= 12 ? 1 : elapsed <= 24 ? 2 : 3;
    if (!['GG','FG','FF'].includes(profile.election)) return fail('Select a valid PR contribution arrangement.');
    basis = `PR year ${year === 3 ? '3+' : year} · ${year===3?'full rates':profile.election}`;
    if (year < 3 && profile.election !== 'FF') {
      employeeBps = year === 1 ? 500 : pr2Employee[bandIndex];
      if (profile.election === 'GG') employerBps = (year === 1 ? pr1Employer : pr2Employer)[bandIndex];
    }
  }
  const assessableCents = Math.min(grossCents, 800000);
  let employeeNumerator = 0, employerNumerator = 0;
  if (grossCents > 5000) {
    employerNumerator = assessableCents * employerBps;
    employeeNumerator = grossCents <= 50000 ? 0 : grossCents <= 75000 ? (grossCents - 50000) * employeeBps * 3 : assessableCents * employeeBps;
  }
  // Bps times cents => millionths of a dollar. Total rounds half-up; employee floors.
  const totalCents = Math.floor((employerNumerator + employeeNumerator + 500000) / 1000000) * 100;
  const employeeCents = Math.floor(employeeNumerator / 1000000) * 100;
  const employerCents = totalCents - employeeCents;
  return {...result, assessableCents, employeeCents, employerCents, totalCents, netCents:grossCents-employeeCents, costCents:grossCents+employerCents, employerRate:employerBps/100, employeeRate:employeeBps/100, band:bands[bandIndex], basis};
}
// Fictional profiles: never infer residency or age from a person's name.
export const demoCpfProfiles: Record<string,CpfProfile> = Object.fromEntries(
  ['p1','p2','p3','p4','p5','p6','p7','p8'].map((id,i)=>[id, {
    birthMonth:['1990-04','1988-11','1995-02','1992-08','1968-06','1963-01','1998-03','1989-10'][i],
    residency:i===3?'foreign':i===6||i===7?'pr':'citizen',
    prSince:i===6?'2026-01-12':'2025-03-20', election:'GG'
  }])
);
