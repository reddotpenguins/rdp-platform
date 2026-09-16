export type JournalAccounts = {wages:string;employerCpf:string;cpfPayable:string;netPayable:string};
export type PayrollTotals = {grossCents:number;employerCents:number;employeeCents:number};
export function buildPayrollJournal(month:string,totals:PayrollTotals,accounts:JournalAccounts) {
 if(!/^2026-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid 2026 payroll month.');
 if(Object.values(accounts).some(a=>!a.trim())) throw new Error('Map all four QuickBooks accounts before preparing the journal.');
 if(new Set(Object.values(accounts).map(a=>a.trim())).size!==4) throw new Error('Use separate expense and liability accounts.');
 if(!Object.values(totals).every(n=>Number.isSafeInteger(n)&&n>=0)||totals.employeeCents>totals.grossCents||totals.grossCents===0) throw new Error('The payroll totals must contain valid positive wages.');
 const lastDay=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 const entries=[
  {account:accounts.wages,amount:totals.grossCents,type:'Debit',description:'Gross wages'},
  {account:accounts.employerCpf,amount:totals.employerCents,type:'Debit',description:'Employer CPF expense'},
  {account:accounts.cpfPayable,amount:totals.employerCents+totals.employeeCents,type:'Credit',description:'CPF payable (employer and employee)'},
  {account:accounts.netPayable,amount:totals.grossCents-totals.employeeCents,type:'Credit',description:'Net wages payable before other deductions'}
 ];
 return {TxnDate:`${month}-${lastDay}`,DocNumber:`DEMO-PAY-${month}`,PrivateNote:'DEMO ONLY. Ordinary Wages and CPF estimate. Not a payroll submission or payment. Validate a finalized monthly payroll and real account IDs before posting.',Line:entries.filter(e=>e.amount>0).map(e=>({Amount:e.amount/100,Description:e.description,DetailType:'JournalEntryLineDetail',JournalEntryLineDetail:{PostingType:e.type,AccountRef:{value:e.account.trim()}}}))};
}
