// Local PostgreSQL only. Set RDP_PGLITE_MODULE to an installed @electric-sql/pglite module.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.RDP_PGLITE_MODULE);
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const coach = "00000000-0000-4000-8000-000000000002";
const inactive = "00000000-0000-4000-8000-000000000003";
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated, service_role;
create table staff_profiles(id uuid primary key, role text, active boolean);
insert into staff_profiles values ('${admin}', 'admin', true), ('${coach}', 'coach', true), ('${inactive}', 'admin', false);
create function public.current_staff_role() returns text language sql security definer stable as $$select role from public.staff_profiles where id=auth.uid() and active=true$$;
create table customer_enquiries(id uuid primary key default gen_random_uuid(), respondio_conversation_id text, created_at timestamptz default now());
insert into customer_enquiries(respondio_conversation_id) values ('example-conversation-id');
alter table customer_enquiries enable row level security;
create policy admins on customer_enquiries for select to authenticated using (current_staff_role()='admin');
grant select on customer_enquiries to authenticated;
`);
const migration = await readFile(new URL("../supabase/enquiry-import-skips.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration); // Safe to reapply this migration.
const actor = async (id, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
};
await actor(admin, "service_role");
const insert = () => db.query(`insert into enquiry_import_skips(respondio_conversation_id,error_message,incoming_data)
values('example-conversation-id','duplicate key', '{"message":"Please check this enquiry"}') returning id`);
const first = (await insert()).rows[0].id;
await insert();
await assert.rejects(() => db.query("update enquiry_import_skips set parent_name='changed'"), /permission denied/);
await assert.rejects(() => db.query("insert into enquiry_import_skips(respondio_conversation_id,error_message,incoming_data) values ('x','error','[]')"), /check constraint/);
await actor(admin);
let queue = (await db.query("select * from enquiry_import_skip_queue")).rows;
assert.equal(queue.length, 2);
assert.ok(queue.every(row => row.decision === "needs_review" && row.existing_enquiry_id));
await db.query("insert into enquiry_import_skip_reviews(skip_id,decision,notes) values($1,'existing_record','Checked existing enquiry')", [first]);
await db.query("insert into enquiry_import_skip_reviews(skip_id,decision,notes) values($1,'add_to_database','New details need adding')", [first]);
queue = (await db.query("select * from enquiry_import_skip_queue where id=$1", [first])).rows;
assert.equal(queue[0].decision, "add_to_database");
assert.equal(queue[0].reviewed_by, admin);
assert.equal((await db.query("select * from enquiry_import_skip_reviews")).rows.length, 2);
await assert.rejects(() => db.query("insert into enquiry_import_skip_reviews(skip_id,decision,notes,reviewed_by) values($1,'not_needed','spoof',$2)", [first, coach]), /permission denied/);
await assert.rejects(() => db.query("delete from enquiry_import_skip_reviews"), /permission denied/);
await assert.rejects(() => db.query("insert into enquiry_import_skips(respondio_conversation_id,error_message,incoming_data) values('x','error','{}')"), /permission denied/);
await assert.rejects(() => db.query("insert into enquiry_import_skip_reviews(skip_id,decision,notes) values($1,'not_needed',' ')", [first]), /check constraint/);
for (const id of [coach, inactive]) {
  await actor(id);
  assert.equal((await db.query("select * from enquiry_import_skip_queue")).rows.length, 0);
  assert.equal((await db.query("select * from enquiry_import_skip_reviews")).rows.length, 0);
  await assert.rejects(() => db.query("insert into enquiry_import_skip_reviews(skip_id,decision,notes) values($1,'not_needed','Denied')", [first]), /row-level security/);
}
await actor("", "anon");
await assert.rejects(() => db.query("select * from enquiry_import_skip_queue"), /permission denied/);
await db.exec("reset role");
await assert.rejects(() => db.query("update enquiry_import_skips set parent_name='tampered'"), /cannot be changed/);
assert.equal((await db.query("select count(*)::int as count from customer_enquiries")).rows[0].count, 1);
await db.close();
console.log("Skipped-import SQL verified: repeat events, review history, matching, immutable evidence, RLS, spoof prevention, validation, migration reapplication.");
