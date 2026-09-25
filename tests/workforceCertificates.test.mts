import test from 'node:test';
import assert from 'node:assert/strict';
import {certificateStatus,qualificationCoversShift,validDate} from '../lib/workforce-certificates.ts';
test('expiry countdown distinguishes missing, due today, 7/30 days and expired',()=>{
 const record=(date:string)=>({awarded_at:null,expires_at:date});
 assert.equal(certificateStatus(undefined,'2026-09-25').tone,'missing');
 assert.equal(certificateStatus(record('2026-09-24'),'2026-09-25').tone,'expired');
 assert.equal(certificateStatus(record('2026-09-25'),'2026-09-25').label,'Expires today');
 assert.equal(certificateStatus(record('2026-10-02'),'2026-09-25').tone,'urgent');
 assert.equal(certificateStatus(record('2026-10-25'),'2026-09-25').tone,'soon');
 assert.equal(certificateStatus(record('2026-10-26'),'2026-09-25').tone,'valid');
 assert.equal(certificateStatus({awarded_at:null,expires_at:null},'2026-09-25').tone,'unknown');
});
test('required qualification must cover the entire Singapore shift; midnight end is exclusive',()=>{
 const record={awarded_at:'2026-09-25',expires_at:'2026-09-25'};
 assert.equal(qualificationCoversShift(record,'2026-09-25T16:00:00+08:00','2026-09-26T00:00:00+08:00'),true);
 assert.equal(qualificationCoversShift(record,'2026-09-25T16:00:00+08:00','2026-09-26T00:01:00+08:00'),false);
 assert.equal(qualificationCoversShift(record,'2026-09-24T23:00:00+08:00','2026-09-25T01:00:00+08:00'),false);
});
test('impossible expiry dates are rejected',()=>{assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-9-1'),false);});
