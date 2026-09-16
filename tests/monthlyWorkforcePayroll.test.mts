import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyPayroll} from '../modules/workforce-prototype/monthly-payroll.ts';
import {demoCpfProfiles} from '../modules/workforce-prototype/cpf.ts';
import type {Timesheet} from '../modules/workforce-prototype/model.ts';
const t:Timesheet={id:'one',personId:'p1',date:'2026-09-01',start:'09:00',end:'13:00',breakMinutes:0,location:'Orchard',approved:true};
test('CPF aggregates all approved weeks once, excluding unapproved records and other months',()=>{const rows=monthlyPayroll('2026-09',[t,{...t,id:'two',date:'2026-09-23'},{...t,id:'pending',approved:false},{...t,id:'other-month',date:'2026-10-01'}],demoCpfProfiles,{'2026-09:p1':400000,'2026-10:p1':500000});const p=rows[0];assert.equal(p.hours,8);assert.equal(p.cpf.grossCents,425600);assert.equal(p.cpf.employeeCents,85100);assert.equal(p.cpf.totalCents,157500);assert.equal(p.pending,1);});
test('monthly additional Ordinary Wage assumptions cannot leak into another month',()=>{const row=monthlyPayroll('2026-10',[],demoCpfProfiles,{'2026-09:p1':400000})[0];assert.equal(row.extraCents,0);assert.equal(row.cpf.grossCents,0);});
