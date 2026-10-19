import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const ids = Array.from({length:45},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
let db;
async function sql(s,args=[]){ return (await db.query(s,args)).rows; }
async function as(role,user=null){
 await db.exec('reset role');
 await sql("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user??'',JSON.stringify({sub:user,role,is_anonymous:false})]);
 await db.exec(`set role ${role}`);
}
async function rpc(name,args={}){
 const entries=Object.entries(args);
 const params=entries.map(([k],i)=>`${k} => $${i+1}`).join(',');
 return (await sql(`select public.${name}(${params}) as result`,entries.map(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v)))[0].result;
}
async function rejects(p,pattern){ await assert.rejects(p,pattern); }
async function owner(s,args=[]){await as('postgres'); return sql(s,args);}
function profile(i,overrides={}){return {display_name:`Person ${i}`,dob:'1995-05-10',gender:i%2?'woman':'man',looking_for:['man','woman','nonbinary'],city_id:'lisboa',consent:true,interests:['music'],...overrides};}
async function onboard(i,overrides={}){await as('authenticated',ids[i]); return rpc('complete_onboarding',{p_profile:profile(i,overrides)});}
async function paid(i,plan='gold',event=`billing-${i}`){await as('service_role');return rpc('apply_billing_event',{p_event_id:event,p_user:ids[i],p_status:'active',p_plan:plan,p_customer:`cus-${i}`,p_subscription:`sub-${i}`,p_event_created:new Date(Date.now()-10000).toISOString(),p_period_end:new Date(Date.now()+86400000).toISOString()});}

test('BoraMatch actual migration / authorization integration',async t=>{
 db=new PGlite();
 await db.exec(`
 create role supabase_auth_admin nologin; create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 grant anon,authenticated,service_role to postgres;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,is_anonymous boolean default false,raw_user_meta_data jsonb default '{"dob":"1995-05-10"}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated; grant select,insert,update,delete on storage.objects to service_role;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 `);
 const migrations=(await readdir(new URL('supabase/migrations/',root))).filter(x=>x.endsWith('.sql')).sort();
 assert.ok(migrations.length>0,'CLI-created migration exists');
 for(const m of migrations) await db.exec(await readFile(new URL(`supabase/migrations/${m}`,root),'utf8'));
 for(const id of ids) await sql('insert into auth.users(id) values($1)',[id]);

 await t.test('all public/private tables RLS; every public API is invoker; private primitives inaccessible',async()=>{
  const insecure=await sql("select schemaname,tablename from pg_tables t join pg_class c on c.relname=t.tablename join pg_namespace n on n.oid=c.relnamespace and n.nspname=t.schemaname where schemaname in ('public','private') and not c.relrowsecurity");
  assert.equal(insecure.length,0);
  assert.equal((await sql("select proname from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and prosecdef")).length,0);
  await as('anon'); await rejects(rpc('my_profile'),/permission denied/);
  await as('authenticated',ids[0]); await rejects(sql('select private.card($1,$1)',[ids[0]]),/permission denied/);
  await rejects(sql('select private.eligible($1,$1)',[ids[0]]),/permission denied/);
 });
 await t.test('onboarding requires real authentication, age 18 and explicit consent; rollback',async()=>{
  await as('authenticated'); await rejects(rpc('complete_onboarding',{p_profile:profile(0)}),/authentication_required/);
  await owner('update auth.users set is_anonymous=true where id=$1',[ids[0]]);
  await as('authenticated',ids[0]); await rejects(rpc('complete_onboarding',{p_profile:profile(0)}),/authentication_required/);
  await owner('update auth.users set is_anonymous=false where id=$1',[ids[0]]);
  await as('authenticated',ids[0]);
  await rejects(rpc('complete_onboarding',{p_profile:profile(0,{dob:'2015-01-01'})}),/must_be_18|dob_metadata_mismatch/);
  await rejects(rpc('complete_onboarding',{p_profile:profile(0,{consent:false})}),/consent_required/);
  await rejects(rpc('complete_onboarding',{p_profile:profile(0,{city_id:'bogus'})}),/invalid_city/);
  assert.equal(await rpc('my_profile'),null);
  const p=await onboard(0); assert.equal(p.plan,'free'); assert.equal(p.dob,undefined); assert.equal(p.status,'active');
  await rejects(rpc('complete_onboarding',{p_profile:profile(0)}),/duplicate key/);
  await rejects(rpc('update_profile',{p_profile:{dob:'1990-01-01'}}),/immutable_field/);
  await rejects(rpc('update_profile',{p_profile:{status:'active',plan:'gold'}}),/immutable_field/);
 });
 await t.test('personal RLS, private DOB and no direct invariant bypass',async()=>{
  await onboard(1); await onboard(2); await onboard(3);
  await as('authenticated',ids[0]);
  assert.equal((await sql('select * from public.profiles')).length,1);
  await rejects(sql('select * from private.identities'),/permission denied/);
  for(const table of ['profiles','subscriptions','decisions','matches','messages','read_receipts','blocks','reports','photos','consents','plans','cities']){
   await rejects(sql(`delete from public.${table}`),/permission denied/);
  }
  await rejects(sql("update public.subscriptions set plan_id='gold'"),/permission denied/);
  await rejects(rpc('admin_metrics'),/admin_required/);
 });
 await t.test('discovery mutual gender, age, city, distance, interests, status and prior decisions',async()=>{
  await as('authenticated',ids[0]); let cards=await rpc('discover'); assert.ok(cards.some(x=>x.id===ids[1])); assert.equal(cards[0].dob,undefined); assert.equal(cards[0].latitude,undefined);
  await as('authenticated',ids[1]); await rpc('update_profile',{p_profile:{looking_for:['woman']}});
  await as('authenticated',ids[0]); assert.ok(!(await rpc('discover')).some(x=>x.id===ids[1]));
  await as('authenticated',ids[1]); await rpc('update_profile',{p_profile:{looking_for:['man'],min_age:50,max_age:99}});
  await as('authenticated',ids[0]); assert.ok(!(await rpc('discover')).some(x=>x.id===ids[1]));
  await as('authenticated',ids[1]); await rpc('update_profile',{p_profile:{min_age:18,city_id:'porto',max_distance_km:20000}});
  await as('authenticated',ids[0]); assert.ok(!(await rpc('discover')).some(x=>x.id===ids[1]));
  await rpc('update_profile',{p_profile:{max_distance_km:20000,city_only:true}}); assert.ok(!(await rpc('discover')).some(x=>x.id===ids[1]));
  await rpc('update_profile',{p_profile:{city_only:false}}); assert.ok((await rpc('discover')).some(x=>x.id===ids[1]));
  await as('authenticated',ids[1]); await rpc('update_profile',{p_profile:{city_id:'lisboa',interests:['hiking']}});
  await as('authenticated',ids[0]); assert.ok(!(await rpc('discover')).some(x=>x.id===ids[1]));
  await as('authenticated',ids[1]); await rpc('update_profile',{p_profile:{interests:['music']}});
  await as('authenticated',ids[0]); await rpc('decide',{p_target:ids[2],p_action:'pass'});
  assert.ok(!(await rpc('discover')).some(x=>x.id===ids[2]));
  await rejects(rpc('decide',{p_target:ids[2],p_action:'like'}),/target_unavailable/);
  await rejects(rpc('decide',{p_target:ids[0],p_action:'like'}),/invalid_decision/);
 });
 let match;
 await t.test('mutual likes atomically create canonical match; free rewind denied',async()=>{
  await as('authenticated',ids[0]); await rejects(rpc('rewind'),/plus_required/);
  const first=await rpc('decide',{p_target:ids[1],p_action:'like'}); assert.equal(first.matched,false);
  await as('authenticated',ids[1]); const second=await rpc('decide',{p_target:ids[0],p_action:'superlike'}); assert.equal(second.matched,true); match=second.match_id;
  assert.equal((await rpc('list_matches'))[0].peer.id,ids[0]);
  await owner('select 1'); assert.equal((await sql('select * from public.matches')).length,1);
 });
 await t.test('billing service-only, idempotent, out-of-order, authoritative and expiry',async()=>{
  await as('authenticated',ids[0]); await rejects(rpc('apply_billing_event',{p_event_id:'hack',p_user:ids[0],p_status:'active',p_plan:'gold',p_customer:'a',p_subscription:'b',p_event_created:new Date().toISOString(),p_period_end:new Date(Date.now()+86400000).toISOString()}),/permission denied/);
  assert.equal((await paid(0)).applied,true);
  assert.equal((await paid(0)).reason,'duplicate');
  await as('service_role'); const args={p_event_id:'old',p_user:ids[0],p_status:'canceled',p_plan:'free',p_customer:'a',p_subscription:'b',p_event_created:'2020-01-01T00:00:00Z',p_period_end:null};
  assert.equal((await rpc('apply_billing_event',args)).reason,'stale');
  await as('authenticated',ids[0]); assert.equal((await rpc('my_profile')).plan,'gold');
  await paid(2,'plus'); await owner("update public.subscriptions set period_end=now()-interval '1 second' where user_id=$1",[ids[2]]);
  await as('authenticated',ids[2]); assert.equal((await rpc('my_profile')).plan,'free');
 });
 await t.test('gold likes/boost; rewind does not refund spent likes',async()=>{
  await as('authenticated',ids[0]); assert.ok(Array.isArray(await rpc('who_liked_me'))); assert.ok((await rpc('boost')).boost_until); await rejects(rpc('boost'),/boost_already_active/);
  await rejects(rpc('rewind'),/cannot_rewind_match/);
  await rpc('decide',{p_target:ids[3],p_action:'like'}); assert.equal((await rpc('rewind')).target_id,ids[3]);
  await owner('select 1'); assert.equal((await sql("select likes from private.usage_counters where user_id=$1 and length(period)=10",[ids[0]]))[0].likes,2);
  await as('authenticated',ids[3]); await rejects(rpc('who_liked_me'),/gold_required/); await rejects(rpc('boost'),/gold_required/);
 });
 await t.test('chat authorization, spam quota, receipts, message RLS',async()=>{
  await as('authenticated',ids[2]); await rejects(rpc('send_message',{p_match:match,p_body:'intruder'}),/match_forbidden/);
  assert.equal((await sql('select * from public.messages')).length,0);
  await as('authenticated',ids[0]); await rejects(rpc('send_message',{p_match:match,p_body:'   '}),/invalid_message/);
  for(let i=0;i<20;i++) assert.equal((await rpc('send_message',{p_match:match,p_body:`hello ${i}`})).sender_id,ids[0]);
  await rejects(rpc('send_message',{p_match:match,p_body:'too fast'}),/message_rate_limit/);
  await as('authenticated',ids[1]); assert.equal((await rpc('get_messages',{p_match:match})).length,20); assert.equal((await rpc('list_matches'))[0].unread_count,20);
  assert.ok((await rpc('mark_read',{p_match:match})).read_at); assert.equal((await rpc('list_matches'))[0].unread_count,0);
 });
 await t.test('F04 composite pagination traverses 225 identical timestamps without loss; authorization',async()=>{
  await owner("insert into public.messages(id,match_id,sender_id,body,created_at) select ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,$2,'tie '||i,'2020-01-01T12:00:00.123456Z'::timestamptz from generate_series(1,225) i",[match,ids[0]]);
  await as('authenticated',ids[1]);
  let cursor={p_match:match,p_before:'2020-01-02T00:00:00Z'}, seen=[];
  for(const size of [100,100,25]) {
   const page=await rpc('get_messages_page',cursor); assert.equal(page.length,size);
   const sorted=[...page].sort((a,b)=>a.id.localeCompare(b.id)); assert.deepEqual(page,sorted);
   seen.push(...page.map(m=>m.id)); cursor={p_match:match,p_before:page[0].created_at,p_before_id:page[0].id};
  }
  assert.equal(new Set(seen).size,225);
  assert.deepEqual([...seen].sort(),Array.from({length:225},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`));
  assert.equal((await rpc('get_messages_page',cursor)).length,0);
  assert.equal((await rpc('get_messages',{p_match:match,p_before:'2020-01-02T00:00:00Z'})).length,100);
  await as('authenticated',ids[2]); await rejects(rpc('get_messages_page',{p_match:match}),/match_forbidden/);
  await as('anon'); await rejects(rpc('get_messages_page',{p_match:match}),/permission denied/);
  await as('authenticated'); await rejects(rpc('get_messages_page',{p_match:match}),/authentication_required/);
  await owner("delete from public.messages where match_id=$1 and created_at<'2020-01-02'",[match]);
 });
 await t.test('private photos ownership, maximum nine, signed-read predicate and no upsert',async()=>{
  await as('authenticated',ids[0]);
  const paths=[]; for(let i=1;i<=9;i++) paths.push((await rpc('reserve_photo',{p_slot:i,p_extension:'jpg'})).path);
  await rejects(rpc('reserve_photo',{p_slot:10,p_extension:'jpg'}),/invalid_photo/); await rejects(rpc('reserve_photo',{p_slot:1,p_extension:'svg'}),/invalid_photo/);
  await rejects(sql("insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",[paths[0],ids[0]]),/row-level security/);
  await as('service_role');await sql("insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",[paths[0],ids[0]]);
  await as('authenticated',ids[0]);
  await rejects(sql("insert into storage.objects(bucket_id,name) values('profile-photos',$1)",[`${ids[0]}/unreserved.jpg`]),/row-level security/);
  assert.equal((await sql('select * from storage.objects')).length,1);
  await sql("update storage.objects set name='hacked'"); assert.equal((await sql('select name from storage.objects'))[0].name,paths[0]);
  await as('authenticated',ids[1]); assert.equal((await sql('select * from storage.objects')).length,1);
  await rejects(sql("insert into storage.objects(bucket_id,name) values('profile-photos',$1)",[paths[1]]),/row-level security/);
  await as('authenticated',ids[0]); await rpc('remove_photo',{p_slot:1}); assert.equal((await sql('select * from storage.objects')).length,0);
  await as('service_role'); assert.equal((await rpc('storage_cleanup_queue')).length,1);
 });
 await t.test('block revokes messages, discovery, receipts and photo access both directions',async()=>{
  await as('authenticated',ids[1]); await rpc('block_user',{p_target:ids[0]});
  await rejects(rpc('send_message',{p_match:match,p_body:'blocked'}),/match_forbidden/); assert.equal((await rpc('list_matches')).length,0);
  await as('authenticated',ids[0]); await rejects(rpc('get_messages',{p_match:match}),/match_forbidden/); await rejects(rpc('mark_read',{p_match:match}),/match_forbidden/);
  assert.equal((await sql('select * from public.messages')).length,0); assert.equal((await sql('select * from public.read_receipts')).length,0);
  assert.ok(!(await rpc('discover')).some(x=>x.id===ids[1]));
 });
 await t.test('reports, explicit DB admin roles, moderator boundary and no message text in metrics',async()=>{
  await as('authenticated',ids[2]); await rpc('report_user',{p_target:ids[3],p_reason:'spam',p_details:'abuse context'});
  await as('authenticated',ids[3]); assert.equal((await sql('select * from public.reports')).length,0); await rejects(rpc('admin_reports'),/admin_required/);
  await owner("insert into private.admin_roles values($1,'admin'),($2,'moderator')",[ids[0],ids[1]]);
  await as('authenticated',ids[0]); const metrics=await rpc('admin_metrics'); assert.equal(metrics.registered_users,ids.length); assert.ok(metrics.registered_users>metrics.profiles); assert.equal(metrics.messages_count,20); assert.ok(!JSON.stringify(metrics).includes('hello'));
  assert.equal((await rpc('admin_reports')).length,1);
  await rpc('admin_moderate',{p_target:ids[3],p_action:'suspend',p_reason:'spam verified'});
  await as('authenticated',ids[3]); await rejects(rpc('discover'),/active_profile_required/);
  await as('authenticated',ids[1]); await rejects(rpc('admin_metrics'),/admin_required/);
  await rpc('admin_moderate',{p_target:ids[3],p_action:'restore',p_reason:'appeal accepted'});
  await rejects(rpc('admin_save_city',{p_city:{}}),/admin_required/);
 });
 await t.test('quota serializes on account and remains spent after rewind',async()=>{
  await owner("update public.plans set daily_likes=1,daily_superlikes=1 where id='free'");
  await onboard(4); await onboard(5); await onboard(6);
  await as('authenticated',ids[4]); await rpc('decide',{p_target:ids[5],p_action:'like'});
  await rejects(rpc('decide',{p_target:ids[6],p_action:'like'}),/daily_limit/);
  assert.equal((await rpc('decide',{p_target:ids[6],p_action:'pass'})).action,'pass');
  await owner('select 1'); const body=(await sql("select prosrc from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='private' and proname='decide'"))[0].prosrc;
  assert.match(body,/order by id for update/); assert.match(body,/usage_counters[\s\S]*for update/);
 });
 await t.test('unmatch is permanent, participant-only; export owns DOB and excludes unrelated messages',async()=>{
  await owner("update public.plans set daily_likes=30 where id='free'");
  await as('authenticated',ids[5]); const x=await rpc('decide',{p_target:ids[4],p_action:'like'}); assert.ok(x.matched);
  await as('authenticated',ids[6]); await rejects(rpc('unmatch',{p_match:x.match_id}),/match_forbidden/);
  await as('authenticated',ids[4]); await rpc('unmatch',{p_match:x.match_id}); await rejects(rpc('send_message',{p_match:x.match_id,p_body:'ended'}),/match_forbidden/);
  assert.ok(!(await rpc('discover')).some(c=>c.id===ids[5]));
  const exp=await rpc('export_data'); assert.equal(exp.profile.dob,'1995-05-10'); assert.equal(exp.messages.length,0);
 });
 await t.test('deletion immediate deny, deferred purge, physical cleanup queues and anon reports',async()=>{
  await as('authenticated',ids[2]); const d=await rpc('request_deletion'); assert.ok(d.purge_after); await rejects(rpc('discover'),/account_deleting/); await rejects(rpc('my_profile'),/account_deleting/);
  assert.ok((await rpc('export_data')).profile);
  await as('service_role'); assert.equal((await rpc('purge_deleted_accounts')).purged,0);
  await owner("update private.identities set purge_after=now()-interval '1 day' where user_id=$1",[ids[2]]);
  await as('service_role'); assert.equal((await rpc('purge_deleted_accounts')).purged,1); assert.ok((await rpc('auth_deletion_queue')).some(x=>x.user_id===ids[2]));
  await owner('select 1'); assert.equal((await sql('select * from public.profiles where id=$1',[ids[2]])).length,0);
  const r=(await sql('select * from public.reports'))[0]; assert.equal(r.reporter_id,null); assert.equal(r.details,'');
  await as('authenticated',ids[2]); await rejects(rpc('discover'),/authentication_required/);
  await rejects(rpc('complete_onboarding',{p_profile:profile(2)}),/authentication_required/);
  await as('service_role'); assert.equal((await rpc('retention_cleanup')).ok,true);
 });

 await t.test('Auth before-user-created hook independently rejects direct underage/anonymous/malformed signups',async()=>{
  await as('supabase_auth_admin');
  for(const metadata of [{},{dob:'invalid'},{dob:'2015-01-01'},{dob:'3000-01-01'}]){
   const result=await rpc('before_user_created',{event:{user:{user_metadata:metadata}}});assert.equal(result.error.http_code,400);
  }
  assert.deepEqual(await rpc('before_user_created',{event:{user:{user_metadata:{dob:'1990-01-01'}}}}),{});
  assert.equal((await rpc('before_user_created',{event:{user:{is_anonymous:true,user_metadata:{dob:'1990-01-01'}}}})).error.http_code,400);
  await as('authenticated',ids[0]);await rejects(rpc('before_user_created',{event:{}}),/permission denied/);
 });
 await t.test('onboarding uses Auth DOB, optional gender defaults, 500 char bio and relationship goal',async()=>{
  await owner("update auth.users set raw_user_meta_data='{"+'"dob":"2015-01-01"'+"}'::jsonb where id=$1",[ids[7]]);
  await as('authenticated',ids[7]);await rejects(rpc('complete_onboarding',{p_profile:{display_name:'Minor',city_id:'lisboa',consent:true}}),/must_be_18/);
  await owner("update auth.users set raw_user_meta_data='{"+'"dob":"1995-05-10"'+"}'::jsonb where id=$1",[ids[7]]);
  await as('authenticated',ids[7]);const p=await rpc('complete_onboarding',{p_profile:{display_name:'Optional gender',city_id:'lisboa',consent:true,relationship_goal:'long-term'}});
  assert.equal(p.gender,'unspecified');assert.equal(p.looking_for.length,4);assert.equal(p.relationship_goal,'long-term');
  await rejects(rpc('update_profile',{p_profile:{bio:'x'.repeat(501)}}),/check constraint/);
  assert.equal((await rpc('update_profile',{p_profile:{bio:'x'.repeat(500)}})).bio.length,500);
 });
 await t.test('SQL optional filters apply before limit and cannot widen persisted eligibility',async()=>{
  await onboard(8,{interests:['cooking'],max_distance_km:20000});await onboard(9,{interests:['music'],city_id:'porto',max_distance_km:20000});
  await onboard(10,{interests:['music'],max_distance_km:20000});
  await as('authenticated',ids[10]);
  await rejects(rpc('discover',{p_interest:'music'}),/plus_required/);
  await rejects(rpc('discover',{p_filters:{interest:'music'}}),/plus_required/);
  assert.ok((await rpc('discover',{p_filters:{city:'porto',min_age:18,max_age:50,max_distance:1000,gender:'woman'}})).some(c=>c.id===ids[9]));
  await paid(10,'plus','interest-plus-access');await as('authenticated',ids[10]);
  const cards=await rpc('discover',{p_limit:1,p_city:'porto',p_min_age:18,p_max_age:50,p_interest:'music',p_max_distance:1000,p_gender:'woman'});
  assert.equal(cards.length,1);assert.equal(cards[0].id,ids[9]);
  const jsonCards=await rpc('discover',{p_limit:1,p_filters:{city:'porto',min_age:18,max_age:50,interest:'music',max_distance:1000,gender:'woman'}});assert.equal(jsonCards[0].id,ids[9]);assert.deepEqual(jsonCards[0].shared_interests,['music']);
  await rejects(rpc('discover',{p_filters:'[]'}),/invalid_filters/);
  assert.deepEqual(await rpc('discover',{p_city:'lisboa',p_interest:'cooking'}),[]);
  assert.deepEqual(await rpc('discover',{p_city:'porto',p_max_age:20}),[]);
  assert.deepEqual(await rpc('discover',{p_city:'porto',p_max_distance:1}),[]);
 });
 await t.test('admin role is live DB state; configured prices and service portal account remain protected',async()=>{
  await as('authenticated',ids[0]);assert.deepEqual(await rpc('is_admin'),{is_admin:true,role:'admin'});
  const plans=await sql('select * from public.plans order by id');assert.equal(plans.find(p=>p.id==='plus').price_cents,990);assert.equal(plans.find(p=>p.id==='gold').price_cents,1990);
  await rpc('admin_save_plan',{p_plan:{...plans.find(p=>p.id==='plus'),stripe_price_id:'price_plus_test'}});
  const city=await rpc('admin_save_city',{p_city:{id:'aveiro',name:'Aveiro',country:'PT',latitude:40.6404,longitude:-8.6538,active:true}});assert.equal(Number(city.latitude),40.64);
  const metrics=await rpc('admin_metrics');assert.ok(metrics.new7d>0);assert.ok(metrics.active30d>0);assert.equal(metrics.estimated_mrr_cents,2980);assert.ok(Number(metrics.conversion_rate)>0);
  await rejects(rpc('billing_account',{p_user:ids[0]}),/permission denied/);
  await as('authenticated',ids[7]);assert.deepEqual(await rpc('is_admin'),{is_admin:false,role:null});
  await as('service_role');assert.equal((await rpc('billing_account',{p_user:ids[0]})).customer_id,'cus-0');
  await as('authenticated',ids[0]);await rejects(rpc('purge_deleted_accounts'),/permission denied/);
 });

 await t.test('discovery ranks observable shared interests before recency without widening eligibility',async()=>{
  await onboard(11,{interests:['music','hiking','cooking']});
  await onboard(12,{interests:['music']});
  await as('authenticated',ids[10]);await rpc('update_profile',{p_profile:{interests:['music','hiking']}});
  const cards=await rpc('discover',{p_limit:50,p_filters:{city:'lisboa'}});assert.ok(cards.findIndex(c=>c.id===ids[11])<cards.findIndex(c=>c.id===ids[12]));
  assert.deepEqual(cards.find(c=>c.id===ids[11]).shared_interests,['hiking','music']);
 });
 await t.test('account deletion durably queues recurring billing cancellation before purge',async()=>{
  await paid(10,'gold','cancel-outbox');await as('authenticated',ids[10]);await rpc('request_deletion');
  await rejects(rpc('billing_cancellation_queue'),/permission denied/);
  await as('service_role');let queue=await rpc('billing_cancellation_queue');const entry=queue.find(x=>x.user_id===ids[10]);assert.equal(entry.subscription_id,'sub-10');
  await owner("update private.identities set purge_after=now()-interval '1 day' where user_id=$1",[ids[10]]);
  await as('service_role');await rpc('purge_deleted_accounts');queue=await rpc('billing_cancellation_queue');assert.ok(queue.some(x=>x.id===entry.id));
  await rpc('ack_billing_cancellation',{p_ids:[entry.id]});assert.ok(!(await rpc('billing_cancellation_queue')).some(x=>x.id===entry.id));
 });

 await t.test('same-second billing revocations win in both arrival orders; newer event may restore',async()=>{
  const stamp=new Date(Date.now()-5000).toISOString();const newer=new Date(Date.now()-1000).toISOString();
  for(const [i,reverse] of [[13,false],[14,true]]){
   await onboard(i);await as('service_role');
   const base={p_user:ids[i],p_plan:'gold',p_customer:'cus-tie-'+i,p_subscription:'sub-tie-'+i,p_event_created:stamp,p_period_end:new Date(Date.now()+86400000).toISOString()};
   const first=await rpc('apply_billing_event',{...base,p_event_id:'tie-first-'+i,p_status:reverse?'canceled':'active'});assert.equal(first.applied,true);
   const second=await rpc('apply_billing_event',{...base,p_event_id:'tie-second-'+i,p_status:reverse?'active':'canceled'});
   assert.equal(second.reason,reverse?'tie_restrictive':'applied');
   await as('authenticated',ids[i]);assert.equal((await rpc('my_profile')).plan,'free');
   await as('service_role');assert.equal((await rpc('apply_billing_event',{...base,p_event_id:'tie-second-'+i,p_status:reverse?'active':'canceled'})).reason,'duplicate');
   assert.equal((await rpc('apply_billing_event',{...base,p_event_id:'tie-newer-'+i,p_status:'active',p_event_created:newer})).applied,true);
   await as('authenticated',ids[i]);assert.equal((await rpc('my_profile')).plan,'gold');
  }
 });
 await t.test('historical Stripe price mappings are immutable, service-read-only and preserve prior prices',async()=>{
  await as('authenticated',ids[0]);
  const current=(await sql("select * from public.plans where id='plus'"))[0];
  await rejects(sql('select * from public.plan_prices'),/permission denied/);
  await rpc('admin_save_plan',{p_plan:{...current,stripe_price_id:'price_plus_v2',price_cents:1290}});
  await rpc('admin_save_plan',{p_plan:{...current,stripe_price_id:'price_plus_v2',price_cents:1290}});
  await rejects(rpc('admin_save_plan',{p_plan:{...current,stripe_price_id:'price_plus_test',price_cents:1290}}),/stripe_price_mapping_conflict/);
  assert.equal((await sql("select stripe_price_id from public.plans where id='plus'"))[0].stripe_price_id,'price_plus_v2');
  await as('service_role');const rows=await sql("select * from public.plan_prices where plan_id='plus' order by price_cents");
  assert.deepEqual(rows.map(x=>[x.stripe_price_id,x.price_cents,x.currency]),[['price_plus_test',990,'EUR'],['price_plus_v2',1290,'EUR']]);
  for(const q of ["update public.plan_prices set price_cents=1","delete from public.plan_prices","insert into public.plan_prices(stripe_price_id,plan_id,price_cents,currency) values('forged','gold',1,'EUR')"]){await rejects(sql(q),/permission denied/);}
  await owner('select 1');await rejects(sql("update public.plan_prices set price_cents=1"),/immutable_plan_price/);await rejects(sql('delete from public.plan_prices'),/immutable_plan_price/);
  await as('anon');await rejects(sql('select * from public.plan_prices'),/permission denied/);
 });
 await db.close();
});
