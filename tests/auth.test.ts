import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAuth } from '../lib/server/auth';
import { updateUser } from '../lib/server/admin-users';
import { migrate } from '../scripts/migrate.mjs';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.mjs';

void test('PostgreSQL auth lifecycle and admin authorization', async () => {
  const url=process.env.TEST_DATABASE_URL;
  assert.ok(url,'Set TEST_DATABASE_URL to a dedicated test database.');
  await migrate(url); await migrate(url);
  const pool=new Pool({connectionString:url,max:1});
  const suffix=randomUUID();
  const adminEmail=`admin-${suffix}@example.com`, memberEmail=`member-${suffix}@example.com`;
  const password='test-password-with-more-than-12-characters';
  let auth: ReturnType<typeof createAuth>;
  async function call(path:string,body?:unknown,cookie?:string,origin='http://localhost:3000') {
    return auth.handler(new Request(`http://localhost:3000/api/auth/${path}`,{method:body?'POST':'GET',headers:{origin,'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));
  }
  function cookie(r:Response) { return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '); }
  try {
    // Bootstrap is only for an empty admin population; use a disposable database.
    await bootstrapAdmin(url,{NODE_ENV:'test',ADMIN_EMAIL:adminEmail,ADMIN_PASSWORD:password,ADMIN_DEPARTMENT:'Account'});
    const admin=(await pool.query("SELECT * FROM users WHERE role='admin' ORDER BY created_at LIMIT 1")).rows[0];
    assert.ok(admin);
    await bootstrapAdmin(url,{NODE_ENV:'test',ADMIN_EMAIL:`unused-${suffix}@example.com`,ADMIN_PASSWORD:password});
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE role='admin'")).rows[0].n,1);
    auth=createAuth(pool,{baseURL:'http://localhost:3000',secret:'test-only-secret-with-at-least-thirty-two-characters'});
    await auth.$context;
    const adminLogin=await call('sign-in/email',{email:admin.email,password});
    assert.equal(adminLogin.status,200,await adminLogin.clone().text());
    await pool.query('DELETE FROM rate_limits');
    let response=await call('sign-up/email',{name:'Test Member',email:memberEmail,password,department:'Marketing',role:'admin',banned:false});
    assert.equal(response.status,400);
    response=await call('sign-up/email',{name:'Test Member',email:memberEmail,password,department:'Marketing'});
    assert.equal(response.status,200,await response.clone().text());
    const member=(await pool.query('SELECT * FROM users WHERE email=$1',[memberEmail])).rows[0];
    assert.equal(member.role,'user');
    const stored=(await pool.query('SELECT password FROM accounts WHERE user_id=$1',[member.id])).rows[0].password;
    assert.notEqual(stored,password); assert.ok(stored.length>60);
    response=await call('sign-in/email',{email:memberEmail,password:'wrong-password'});assert.equal(response.status,401);
    response=await call('sign-in/email',{email:memberEmail,password});assert.equal(response.status,200,await response.clone().text());
    const sessionCookie=cookie(response);assert.match(response.headers.get('set-cookie') || '',/httponly/i);
    response=await call('get-session',undefined,sessionCookie);assert.ok((await response.json() as {user:unknown}).user);
    await assert.rejects(updateUser(pool,member.id,{id:admin.id,department:'HR',role:'user',banned:false}),{status:403});
    await assert.rejects(updateUser(pool,admin.id,{id:admin.id,department:'Account',role:'user',banned:false}),{status:409});
    await assert.rejects(updateUser(pool,admin.id,{id:member.id,department:'Invalid',role:'admin',banned:false}),{status:400});
    await updateUser(pool,admin.id,{id:member.id,department:'Production',role:'user',banned:true});
    response=await call('get-session',undefined,sessionCookie);assert.equal(await response.json(),null);
    response=await call('sign-in/email',{email:memberEmail,password});assert.equal(response.status,403);
    await updateUser(pool,admin.id,{id:member.id,department:'HR',role:'user',banned:false});
    await updateUser(pool,admin.id,{id:member.id,department:'HR',role:'admin',banned:false});
    assert.equal((await pool.query('SELECT role FROM users WHERE id=$1',[member.id])).rows[0].role,'admin');
    await updateUser(pool,admin.id,{id:member.id,department:'HR',role:'user',banned:false});
    // Reset test-only rate counter so remaining lifecycle checks are independent.
    await pool.query('DELETE FROM rate_limits');
    response=await call('sign-in/email',{email:memberEmail,password});assert.equal(response.status,200);
    const secondCookie=cookie(response);
    response=await call('sign-out',{},secondCookie,'https://untrusted.example');assert.equal(response.status,403);
    response=await call('sign-out',{},secondCookie);assert.equal(response.status,200);
    response=await call('get-session',undefined,secondCookie);assert.equal(await response.json(),null);
    const events=(await pool.query('SELECT event FROM auth_events WHERE user_id=$1',[member.id])).rows.map(r=>r.event);
    assert.ok(events.includes('registered') && events.includes('account_updated') && events.includes('session_ended'));
    await pool.query('DELETE FROM rate_limits');
    response=await call('sign-up/email',{name:'Invalid',email:`bad-${suffix}@example.com`,password,department:'Invalid'});assert.ok(response.status>=400);
    response=await call('sign-up/email',{name:'Duplicate',email:memberEmail,password,department:'HR'});
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM users WHERE email=$1',[memberEmail])).rows[0].n,1);
  } finally { await pool.end(); }
});
