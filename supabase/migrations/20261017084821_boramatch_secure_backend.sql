-- BoraMatch: business mutations are available only through authenticated operation RPCs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;

create table public.cities (
 id text primary key check(id ~ '^[a-z0-9-]{2,60}$'), name text not null check(length(name) between 1 and 100),
 country text not null check(length(country)=2), latitude numeric(5,2) not null check(latitude between -90 and 90),
 longitude numeric(6,2) not null check(longitude between -180 and 180), active boolean not null default true
);
create table public.plans (
 id text primary key check(id in ('free','plus','gold')), daily_likes int not null check(daily_likes between 0 and 10000),
 daily_superlikes int not null check(daily_superlikes between 0 and 1000), rewind boolean not null,
 see_likes boolean not null, monthly_boosts int not null check(monthly_boosts between 0 and 100),
 boost_minutes int not null check(boost_minutes between 1 and 1440), price_cents int not null default 0 check(price_cents>=0), currency text not null default 'EUR' check(currency ~ '^[A-Z]{3}$'), stripe_price_id text, active boolean not null default true
);
insert into public.plans values ('free',30,1,false,false,0,30,0,'EUR',null,true),('plus',200,5,true,false,0,30,990,'EUR',null,true),('gold',1000,10,true,true,5,30,1990,'EUR',null,true);
insert into public.cities values
 ('lisboa','Lisboa','PT',38.72,-9.14,true),('porto','Porto','PT',41.15,-8.61,true),
 ('braga','Braga','PT',41.55,-8.43,true),('coimbra','Coimbra','PT',40.20,-8.41,true),
 ('faro','Faro','PT',37.02,-7.93,true),('sao-paulo','São Paulo','BR',-23.55,-46.63,true),
 ('rio-de-janeiro','Rio de Janeiro','BR',-22.91,-43.17,true);
-- Historical provider prices survive plan configuration changes. Only the trusted RPC may append.
create table public.plan_prices (
 stripe_price_id text primary key check(length(btrim(stripe_price_id)) between 1 and 255),
 plan_id text not null references public.plans(id), price_cents int not null check(price_cents>=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'),created_at timestamptz not null default now()
);
create function private.immutable_plan_price() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'immutable_plan_price' using errcode='23514'; end $$;
create trigger immutable_plan_prices before update or delete on public.plan_prices for each row execute function private.immutable_plan_price();
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(btrim(display_name)) between 2 and 60),
 gender text not null check(gender in ('man','woman','nonbinary','unspecified')),
 looking_for text[] not null check(cardinality(looking_for) between 1 and 4 and looking_for <@ array['man','woman','nonbinary','unspecified']),
 city_id text not null references public.cities(id), bio text not null default '' check(length(bio)<=500), relationship_goal text not null default '' check(length(relationship_goal)<=100),
 interests text[] not null default '{}' check(cardinality(interests)<=20 and length(array_to_string(interests,','))<=500),
 min_age int not null default 18 check(min_age between 18 and 99), max_age int not null default 99 check(max_age between min_age and 120),
 max_distance_km int not null default 100 check(max_distance_km between 1 and 20000), city_only boolean not null default false,
 status text not null default 'active' check(status in ('active','suspended','deleting')),
 boost_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.identities (
 user_id uuid primary key references public.profiles(id) on delete cascade, dob date not null,
 deletion_requested_at timestamptz, purge_after timestamptz
);
create table public.consents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 policy_version text not null, accepted_at timestamptz not null default now()
);
create table public.subscriptions (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 plan_id text not null default 'free' references public.plans(id), status text not null default 'canceled'
 check(status in ('active','trialing','past_due','canceled','unpaid')),
 period_end timestamptz, updated_at timestamptz not null default now()
);
create table private.billing_accounts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 customer_id text, subscription_id text, event_created timestamptz not null, event_id text not null
);
create table private.billing_events (event_id text primary key, user_id uuid, received_at timestamptz not null default now());
create table public.decisions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 target_id uuid not null references public.profiles(id) on delete cascade,
 action text not null check(action in ('like','pass','superlike')), created_at timestamptz not null default clock_timestamp(),
 check(user_id<>target_id), unique(user_id,target_id)
);
create index decisions_incoming on public.decisions(target_id,action);
create table public.matches (
 id uuid primary key default gen_random_uuid(), user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(),
 ended_at timestamptz, check(user_a<user_b), unique(user_a,user_b)
);
create index matches_b on public.matches(user_b) where ended_at is null;
create table public.messages (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id) on delete cascade,
 sender_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(length(btrim(body)) between 1 and 2000), created_at timestamptz not null default clock_timestamp()
);
create index messages_match_time on public.messages(match_id,created_at desc);
create index messages_sender_time on public.messages(sender_id,created_at desc);
create table public.read_receipts (
 match_id uuid not null references public.matches(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(), primary key(match_id,user_id)
);
create table public.blocks (
 user_id uuid not null references public.profiles(id) on delete cascade, target_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), check(user_id<>target_id), primary key(user_id,target_id)
);
create index blocks_target on public.blocks(target_id,user_id);
create table public.reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid references public.profiles(id) on delete set null,
 target_id uuid references public.profiles(id) on delete set null,
 reason text not null check(reason in ('spam','harassment','inappropriate','underage','scam','other')),
 details text not null default '' check(length(details)<=2000), status text not null default 'open' check(status in ('open','reviewed')),
 created_at timestamptz not null default now()
);
create table public.photos (
 user_id uuid not null references public.profiles(id) on delete cascade, slot int not null check(slot between 1 and 9),
 path text not null unique, created_at timestamptz not null default now(), primary key(user_id,slot)
);
create table private.usage_counters (
 user_id uuid not null references public.profiles(id) on delete cascade, period text not null,
 likes int not null default 0, superlikes int not null default 0, boosts int not null default 0, primary key(user_id,period)
);
create table private.admin_roles (user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('admin','moderator')));
create table private.audit_log (id uuid primary key default gen_random_uuid(), actor_id uuid, target_id uuid, action text not null, reason text, created_at timestamptz not null default now());
create table private.storage_deletions (id uuid primary key default gen_random_uuid(), path text not null unique, created_at timestamptz not null default now());
create table private.billing_cancellations (id uuid primary key default gen_random_uuid(),user_id uuid not null,customer_id text,subscription_id text not null unique,created_at timestamptz not null default now());
create table private.auth_deletions (user_id uuid primary key, created_at timestamptz not null default now());
create table private.retention_config (id boolean primary key default true check(id), deletion_days int not null check(deletion_days between 0 and 90), report_days int not null check(report_days between 30 and 3650), billing_days int not null check(billing_days>=400), audit_days int not null check(audit_days>=365), policy_version text not null);
insert into private.retention_config values (true,30,180,400,365,'2026-10-17');

-- No implicit privileges, including on newly added tables.
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','private') loop
 execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
 execute format('revoke all on %I.%I from public,anon,authenticated',t.schemaname,t.tablename);
 end loop;
end $$;
grant select on public.cities,public.plans,public.profiles,public.consents,public.subscriptions,public.decisions,public.matches,public.messages,public.read_receipts,public.blocks,public.reports,public.photos to authenticated;
grant select on public.cities,public.plans to anon;
revoke all on public.plan_prices from public,anon,authenticated,service_role;
grant select on public.plan_prices to service_role;
create policy active_cities on public.cities for select to anon,authenticated using(active);
create policy active_plans on public.plans for select to anon,authenticated using(active);
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy own_consent on public.consents for select to authenticated using(user_id=(select auth.uid()));
create policy own_subscription on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy own_decisions on public.decisions for select to authenticated using(user_id=(select auth.uid()));
create policy own_blocks on public.blocks for select to authenticated using(user_id=(select auth.uid()));
create policy own_reports on public.reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy own_photos on public.photos for select to authenticated using(user_id=(select auth.uid()));

create function private.actor(p_require_profile boolean default true,p_allow_deleting boolean default false) returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if u is null or exists(select 1 from private.auth_deletions where user_id=u) or not exists(select 1 from auth.users where id=u and coalesce(is_anonymous,false)=false) then raise exception 'authentication_required' using errcode='42501'; end if;
 if not p_allow_deleting and exists(select 1 from public.profiles where id=u and status='deleting') then raise exception 'account_deleting' using errcode='42501'; end if;
 if p_require_profile and not exists(select 1 from public.profiles where id=u and status='active') then raise exception 'active_profile_required' using errcode='42501'; end if;
 return u;
end $$;
create function private.blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blocks where (user_id=a and target_id=b) or (user_id=b and target_id=a));
$$;
create function private.can_chat(m uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.matches x join public.profiles a on a.id=x.user_a join public.profiles b on b.id=x.user_b
 where x.id=m and u in(x.user_a,x.user_b) and x.ended_at is null and a.status='active' and b.status='active' and not private.blocked(x.user_a,x.user_b));
$$;
create function private.chat_access(m uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin return private.can_chat(m,private.actor()); exception when insufficient_privilege then return false; end $$;
create policy own_matches on public.matches for select to authenticated using(private.chat_access(id));
create policy match_messages on public.messages for select to authenticated using(private.chat_access(match_id));
create policy match_receipts on public.read_receipts for select to authenticated using(private.chat_access(match_id));
create function private.plan_for(u uuid) returns public.plans language sql stable security definer set search_path='' as $$
 select p from public.plans p where p.active and p.id=coalesce((select plan_id from public.subscriptions where user_id=u and status in ('active','trialing') and period_end>now()),'free');
$$;
create function private.distance(a text,b text) returns double precision language sql stable security definer set search_path='' as $$
 select 6371*2*asin(least(1.0,sqrt(power(sin(radians((y.latitude-x.latitude)::double precision)/2),2)+cos(radians(x.latitude::double precision))*cos(radians(y.latitude::double precision))*power(sin(radians((y.longitude-x.longitude)::double precision)/2),2)))) from public.cities x,public.cities y where x.id=a and y.id=b;
$$;
create function private.eligible(u uuid,t uuid,p_ignore_decisions boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles a join private.identities ai on ai.user_id=a.id
 join public.profiles b on b.id=t join private.identities bi on bi.user_id=b.id
 join public.cities ac on ac.id=a.city_id and ac.active join public.cities bc on bc.id=b.city_id and bc.active
 where a.id=u and u<>t and a.status='active' and b.status='active'
 and b.gender=any(a.looking_for) and a.gender=any(b.looking_for)
 and extract(year from age(current_date,bi.dob)) between a.min_age and a.max_age
 and extract(year from age(current_date,ai.dob)) between b.min_age and b.max_age
 and (not a.city_only or a.city_id=b.city_id) and (not b.city_only or a.city_id=b.city_id)
 and private.distance(a.city_id,b.city_id)<=least(a.max_distance_km,b.max_distance_km)
 and (cardinality(a.interests)=0 or cardinality(b.interests)=0 or a.interests && b.interests)
 and not private.blocked(u,t)
 and (p_ignore_decisions or not exists(select 1 from public.decisions where user_id=u and target_id=t))
 and not exists(select 1 from public.matches where user_a=least(u,t) and user_b=greatest(u,t)));
$$;
create function private.card(t uuid,u uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'age',extract(year from age(current_date,i.dob))::int,'gender',p.gender,'city_id',p.city_id,'city_name',c.name,'bio',p.bio,'relationship_goal',p.relationship_goal,'interests',p.interests,'shared_interests',coalesce((select jsonb_agg(x order by x) from (select unnest(p.interests) intersect select unnest((select interests from public.profiles where id=u))) q(x)),'[]'::jsonb),'distance_km',round(private.distance(p.city_id,(select city_id from public.profiles where id=u)))::int,'photos',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'path',path) order by slot) from public.photos where user_id=t),'[]'::jsonb)) from public.profiles p join private.identities i on i.user_id=p.id join public.cities c on c.id=p.city_id where p.id=t;
$$;
create function private.my_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(false); result jsonb; begin
 select (to_jsonb(p)-'updated_at')||jsonb_build_object('age',extract(year from age(current_date,i.dob))::int,'plan',(private.plan_for(u)).id,'photos',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'path',path) order by slot) from public.photos where user_id=u),'[]'::jsonb)) into result from public.profiles p join private.identities i on i.user_id=p.id where p.id=u;
 return result;
end $$;
create function private.complete_onboarding(p_profile jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(false); d date; begin
 if p_profile->'consent' is distinct from 'true'::jsonb then raise exception 'consent_required' using errcode='22023'; end if;
 select (raw_user_meta_data->>'dob')::date into d from auth.users where id=u;
 if p_profile ? 'dob' and (p_profile->>'dob')::date is distinct from d then raise exception 'dob_metadata_mismatch' using errcode='22023'; end if;
 if d is null or d>current_date-interval '18 years' or d<current_date-interval '120 years' then raise exception 'must_be_18' using errcode='22023'; end if;
 if not exists(select 1 from public.cities where id=p_profile->>'city_id' and active) then raise exception 'invalid_city' using errcode='22023'; end if;
 insert into public.profiles(id,display_name,gender,looking_for,city_id,bio,relationship_goal,interests,min_age,max_age,max_distance_km,city_only)
 values(u,btrim(p_profile->>'display_name'),coalesce(p_profile->>'gender','unspecified'),array(select jsonb_array_elements_text(coalesce(p_profile->'looking_for','["man","woman","nonbinary","unspecified"]'::jsonb))),p_profile->>'city_id',coalesce(p_profile->>'bio',''),coalesce(p_profile->>'relationship_goal',''),array(select jsonb_array_elements_text(coalesce(p_profile->'interests','[]'))),coalesce((p_profile->>'min_age')::int,18),coalesce((p_profile->>'max_age')::int,99),coalesce((p_profile->>'max_distance_km')::int,100),coalesce((p_profile->>'city_only')::boolean,false));
 insert into private.identities(user_id,dob) values(u,d);
 insert into public.consents(user_id,policy_version) select u,policy_version from private.retention_config;
 insert into public.subscriptions(user_id) values(u);
 return private.my_profile();
end $$;
create function private.update_profile(p_profile jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); begin
 perform 1 from public.profiles where id=u for update;
 if p_profile ?| array['dob','status','plan','id','boost_until','consent'] then raise exception 'immutable_field' using errcode='22023'; end if;
 if p_profile ? 'city_id' and not exists(select 1 from public.cities where id=p_profile->>'city_id' and active) then raise exception 'invalid_city' using errcode='22023'; end if;
 update public.profiles set display_name=coalesce(btrim(p_profile->>'display_name'),display_name),gender=coalesce(p_profile->>'gender',gender),
 looking_for=case when p_profile ? 'looking_for' then array(select jsonb_array_elements_text(p_profile->'looking_for')) else looking_for end,
 city_id=coalesce(p_profile->>'city_id',city_id),bio=coalesce(p_profile->>'bio',bio),relationship_goal=coalesce(p_profile->>'relationship_goal',relationship_goal),
 interests=case when p_profile ? 'interests' then array(select jsonb_array_elements_text(p_profile->'interests')) else interests end,
 min_age=coalesce((p_profile->>'min_age')::int,min_age),max_age=coalesce((p_profile->>'max_age')::int,max_age),
 max_distance_km=coalesce((p_profile->>'max_distance_km')::int,max_distance_km),city_only=coalesce((p_profile->>'city_only')::boolean,city_only),updated_at=now() where id=u;
 return private.my_profile();
end $$;
create function private.discover(p_limit int default 20,p_city text default null,p_min_age int default null,p_max_age int default null,p_interest text default null,p_max_distance int default null,p_gender text default null,p_filters jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(); result jsonb; begin
 if p_filters is not null and jsonb_typeof(p_filters)<>'object' then raise exception 'invalid_filters' using errcode='22023'; end if;
 p_city:=coalesce(p_city,nullif(p_filters->>'city','')); p_gender:=coalesce(p_gender,nullif(p_filters->>'gender',''));
 p_min_age:=coalesce(p_min_age,(p_filters->>'min_age')::int); p_max_age:=coalesce(p_max_age,(p_filters->>'max_age')::int);
 p_interest:=coalesce(p_interest,nullif(p_filters->>'interest',''));p_max_distance:=coalesce(p_max_distance,(p_filters->>'max_distance')::int);
 if p_interest is not null and coalesce((private.plan_for(u)).id,'free')='free' then raise exception 'plus_required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.card(id,u) order by boosted desc nulls last,shared_count desc,created_at desc,id),'[]'::jsonb) into result from (select id,created_at,(boost_until>now()) as boosted,cardinality(array(select unnest(interests) intersect select unnest((select interests from public.profiles where id=u)))) as shared_count from public.profiles where private.eligible(u,id) and (p_city is null or city_id=p_city) and (p_gender is null or gender=p_gender) and (p_interest is null or p_interest=any(interests)) and (p_min_age is null or (select extract(year from age(current_date,dob)) from private.identities where user_id=id)>=p_min_age) and (p_max_age is null or (select extract(year from age(current_date,dob)) from private.identities where user_id=id)<=p_max_age) and (p_max_distance is null or private.distance(city_id,(select city_id from public.profiles where id=u))<=p_max_distance) order by boosted desc nulls last,shared_count desc,created_at desc,id limit greatest(1,least(coalesce(p_limit,20),50))) q;
 return result;
end $$;
create function private.decide(p_target uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); d uuid; m uuid; p public.plans; k text:=to_char(timezone('UTC',now()),'YYYY-MM-DD'); n private.usage_counters; begin
 if p_target is null or p_target=u or p_action is null or p_action not in ('like','pass','superlike') then raise exception 'invalid_decision' using errcode='22023'; end if;
 -- Canonical locking prevents reciprocal likes, blocks and quota races; all pair writes share this order.
 perform 1 from public.profiles where id in(u,p_target) order by id for update;
 if not private.eligible(u,p_target) then raise exception 'target_unavailable' using errcode='42501'; end if;
 p:=private.plan_for(u);
 insert into private.usage_counters(user_id,period) values(u,k) on conflict do nothing;
 select * into n from private.usage_counters where user_id=u and period=k for update;
 if p_action in ('like','superlike') and (p.id is null or n.likes>=p.daily_likes or (p_action='superlike' and n.superlikes>=p.daily_superlikes)) then raise exception 'daily_limit' using errcode='P0001'; end if;
 update private.usage_counters set likes=likes+case when p_action<>'pass' then 1 else 0 end,superlikes=superlikes+case when p_action='superlike' then 1 else 0 end where user_id=u and period=k;
 insert into public.decisions(user_id,target_id,action) values(u,p_target,p_action) returning id into d;
 if p_action<>'pass' and exists(select 1 from public.decisions where user_id=p_target and target_id=u and action in ('like','superlike')) then
 insert into public.matches(user_a,user_b) values(least(u,p_target),greatest(u,p_target)) on conflict(user_a,user_b) do nothing returning id into m;
 end if;
 return jsonb_build_object('decision_id',d,'target_id',p_target,'action',p_action,'matched',m is not null,'match_id',m);
end $$;
create function private.rewind() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); d public.decisions; begin
 perform 1 from public.profiles where id=u for update;
 if not coalesce((private.plan_for(u)).rewind,false) then raise exception 'plus_required' using errcode='42501'; end if;
 select * into d from public.decisions where user_id=u order by created_at desc,id desc limit 1 for update;
 if d.id is null then raise exception 'nothing_to_rewind'; end if;
 if exists(select 1 from public.matches where user_a=least(u,d.target_id) and user_b=greatest(u,d.target_id)) then raise exception 'cannot_rewind_match'; end if;
 delete from public.decisions where id=d.id;
 return jsonb_build_object('target_id',d.target_id);
end $$;
create function private.boost() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); p public.plans; k text:=to_char(timezone('UTC',now()),'YYYY-MM'); until_at timestamptz; begin
 perform 1 from public.profiles where id=u for update; p:=private.plan_for(u);
 if coalesce(p.monthly_boosts,0)=0 then raise exception 'gold_required' using errcode='42501'; end if;
 if exists(select 1 from public.profiles where id=u and boost_until>now()) then raise exception 'boost_already_active'; end if;
 insert into private.usage_counters(user_id,period) values(u,k) on conflict do nothing;
 update private.usage_counters set boosts=boosts+1 where user_id=u and period=k and boosts<p.monthly_boosts;
 if not found then raise exception 'boost_limit'; end if;
 until_at:=now()+make_interval(mins=>p.boost_minutes); update public.profiles set boost_until=until_at where id=u;
 return jsonb_build_object('boost_until',until_at);
end $$;
create function private.who_liked_me() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(); result jsonb; begin
 if not coalesce((private.plan_for(u)).see_likes,false) then raise exception 'gold_required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.card(user_id,u)),'[]'::jsonb) into result from public.decisions where target_id=u and action<>'pass' and private.eligible(u,user_id);
 return result;
end $$;
create function private.list_matches() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(); result jsonb; begin
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'created_at',m.created_at,'peer',private.card(case when m.user_a=u then m.user_b else m.user_a end,u),
 'last_message',(select to_jsonb(x) from (select id,sender_id,body,created_at from public.messages where match_id=m.id order by created_at desc,id desc limit 1)x),
 'unread_count',(select count(*) from public.messages where match_id=m.id and sender_id<>u and created_at>coalesce((select read_at from public.read_receipts where match_id=m.id and user_id=u),'-infinity'::timestamptz)),
 'peer_read_at',(select read_at from public.read_receipts where match_id=m.id and user_id<>u)) order by m.created_at desc),'[]'::jsonb) into result from public.matches m where private.can_chat(m.id,u);
 return result;
end $$;
create function private.get_messages(p_match uuid,p_before timestamptz default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(); result jsonb; begin
 if not private.can_chat(p_match,u) then raise exception 'match_forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by created_at,id),'[]'::jsonb) into result from (select * from public.messages where match_id=p_match and (p_before is null or created_at<p_before) order by created_at desc,id desc limit 100)q;
 return result;
end $$;
create function private.send_message(p_match uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); m public.matches; msg public.messages; begin
 select * into m from public.matches where id=p_match;
 if m.id is null then raise exception 'match_forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id in(m.user_a,m.user_b) order by id for update;
 if not private.can_chat(p_match,u) then raise exception 'match_forbidden' using errcode='42501'; end if;
 if p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'invalid_message' using errcode='22023'; end if;
 if (select count(*) from public.messages where sender_id=u and created_at>clock_timestamp()-interval '1 minute')>=20
 or (select count(*) from public.messages where sender_id=u and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=500 then raise exception 'message_rate_limit'; end if;
 insert into public.messages(match_id,sender_id,body) values(p_match,u,btrim(p_body)) returning * into msg;
 return to_jsonb(msg);
end $$;
create function private.mark_read(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); t timestamptz:=clock_timestamp(); begin
 if not private.can_chat(p_match,u) then raise exception 'match_forbidden' using errcode='42501'; end if;
 insert into public.read_receipts(match_id,user_id,read_at) values(p_match,u,t) on conflict(match_id,user_id) do update set read_at=greatest(public.read_receipts.read_at,excluded.read_at);
 return jsonb_build_object('read_at',t);
end $$;
create function private.block_user(p_target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); begin
 if p_target is null or p_target=u or not exists(select 1 from public.profiles where id=p_target) then raise exception 'invalid_target' using errcode='22023'; end if;
 perform 1 from public.profiles where id in(u,p_target) order by id for update;
 insert into public.blocks(user_id,target_id) values(u,p_target) on conflict do nothing;
 update public.matches set ended_at=coalesce(ended_at,now()) where user_a=least(u,p_target) and user_b=greatest(u,p_target);
 return jsonb_build_object('ok',true);
end $$;
create function private.unmatch(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); m public.matches; begin
 select * into m from public.matches where id=p_match and u in(user_a,user_b);
 if m.id is null then raise exception 'match_forbidden' using errcode='42501'; end if;
 perform 1 from public.profiles where id in(m.user_a,m.user_b) order by id for update;
 update public.matches set ended_at=coalesce(ended_at,now()) where id=p_match;
 return jsonb_build_object('ok',true);
end $$;
create function private.report_user(p_target uuid,p_reason text,p_details text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); r uuid; begin
 if (select count(*) from public.reports where reporter_id=u and created_at>now()-interval '1 day')>=20 then raise exception 'report_limit'; end if;
 perform private.block_user(p_target);
 insert into public.reports(reporter_id,target_id,reason,details) values(u,p_target,p_reason,coalesce(p_details,'')) returning id into r;
 return jsonb_build_object('report_id',r);
end $$;

create function private.reserve_photo(p_slot int,p_extension text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); path_value text; begin
 perform 1 from public.profiles where id=u for update;
 if p_slot is null or p_slot not between 1 and 9 or p_extension is null or lower(p_extension) not in ('jpg','jpeg','png','webp') then raise exception 'invalid_photo' using errcode='22023'; end if;
 if exists(select 1 from public.photos where user_id=u and slot=p_slot) then raise exception 'photo_slot_occupied'; end if;
 path_value:=u::text||'/'||gen_random_uuid()::text||'.'||lower(p_extension);
 insert into public.photos(user_id,slot,path) values(u,p_slot,path_value);
 return jsonb_build_object('path',path_value,'bucket','profile-photos');
end $$;
create function private.remove_photo(p_slot int) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(); p text; begin
 perform 1 from public.profiles where id=u for update;
 delete from public.photos where user_id=u and slot=p_slot returning path into p;
 if p is not null then insert into private.storage_deletions(path) values(p) on conflict do nothing; end if;
 return jsonb_build_object('ok',true);
end $$;
create function private.photo_access(p_path text,p_write boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare u uuid; owner_id uuid; begin
 u:=private.actor();
 select user_id into owner_id from public.photos where path=p_path;
 if owner_id is null then return false; end if;
 if p_write then return owner_id=u; end if;
 return owner_id=u or (not private.blocked(u,owner_id) and exists(select 1 from public.profiles where id=owner_id and status='active') and
 (private.eligible(u,owner_id) or exists(select 1 from public.matches where user_a=least(u,owner_id) and user_b=greatest(u,owner_id) and private.can_chat(id,u))));
 exception when insufficient_privilege then return false;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-photos','profile-photos',false,8388608,array['image/jpeg','image/png','image/webp']);
-- No client INSERT policy: the authenticated API must sanitize/re-encode before service-role upload.
create policy photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and private.photo_access(name,false));
create policy photo_delete on storage.objects for delete to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No UPDATE policy: replacement must reserve a new UUID path.

create function private.require_service() returns void language plpgsql stable security invoker set search_path='' as $$
begin
 -- In SECURITY DEFINER callers current_user is the owner; JWT role alone is not trusted.
 -- session_user is authenticator in PostgREST; current_setting('role') preserves the actual SET ROLE.
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
end $$;
create function private.apply_billing_event(p_event_id text,p_user uuid,p_status text,p_plan text,p_customer text,p_subscription text,p_event_created timestamptz,p_period_end timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_service();
 if p_event_id is null or length(p_event_id) not between 1 and 255 or p_event_created is null or p_event_created>now()+interval '5 minutes' or p_status is null or p_status not in ('active','trialing','past_due','canceled','unpaid') or p_plan is null or not exists(select 1 from public.plans where id=p_plan) then raise exception 'invalid_billing_event' using errcode='22023'; end if;
 perform 1 from public.profiles where id=p_user for update;
 if not found then raise exception 'unknown_user' using errcode='22023'; end if;
 insert into private.billing_events(event_id,user_id) values(p_event_id,p_user) on conflict do nothing;
 if not found then return jsonb_build_object('applied',false,'reason','duplicate'); end if;
 if exists(select 1 from private.billing_accounts where user_id=p_user and event_created>p_event_created) then return jsonb_build_object('applied',false,'reason','stale'); end if;
 -- Conservative same-second ordering: a revocation cannot be overwritten by a concurrent activation.
 if exists(select 1 from private.billing_accounts b join public.subscriptions s on s.user_id=b.user_id
 where b.user_id=p_user and b.event_created=p_event_created and s.status not in ('active','trialing'))
 and p_status in ('active','trialing') then return jsonb_build_object('applied',false,'reason','tie_restrictive'); end if;
 insert into private.billing_accounts(user_id,customer_id,subscription_id,event_created,event_id) values(p_user,p_customer,p_subscription,p_event_created,p_event_id)
 on conflict(user_id) do update set customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,event_created=excluded.event_created,event_id=excluded.event_id;
 update public.subscriptions set plan_id=p_plan,status=p_status,period_end=p_period_end,updated_at=now() where user_id=p_user;
 if exists(select 1 from public.profiles where id=p_user and status='deleting') and p_subscription is not null and p_status in ('active','trialing','past_due','unpaid') then
 insert into private.billing_cancellations(user_id,customer_id,subscription_id) values(p_user,p_customer,p_subscription) on conflict(subscription_id) do nothing; end if;
 return jsonb_build_object('applied',true,'reason','applied');
end $$;
create function private.require_admin(p_full boolean default false) returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(); begin
 if not exists(select 1 from private.admin_roles where user_id=u and (role='admin' or (not p_full and role='moderator'))) then raise exception 'admin_required' using errcode='42501'; end if;
 return u;
end $$;
create function private.admin_metrics() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_admin(true);
 return jsonb_build_object('registered_users',(select count(*) from auth.users where coalesce(is_anonymous,false)=false),'profiles',(select count(*) from public.profiles),'active_profiles',(select count(*) from public.profiles where status='active'),'matches',(select count(*) from public.matches where ended_at is null),'messages_count',(select count(*) from public.messages),'open_reports',(select count(*) from public.reports where status='open'),'new7d',(select count(*) from public.profiles where created_at>now()-interval '7 days'),'active30d',(select count(*) from public.profiles p where p.status='active' and (p.updated_at>now()-interval '30 days' or exists(select 1 from public.decisions d where d.user_id=p.id and d.created_at>now()-interval '30 days') or exists(select 1 from public.messages m where m.sender_id=p.id and m.created_at>now()-interval '30 days'))),'estimated_mrr_cents',coalesce((select sum(p.price_cents) from public.subscriptions s join public.plans p on p.id=s.plan_id where s.status in ('active','trialing') and s.period_end>now()),0),'conversion_rate',coalesce((select count(*) filter(where s.plan_id<>'free' and s.status in ('active','trialing') and s.period_end>now())::numeric/nullif(count(*),0) from public.profiles p left join public.subscriptions s on s.user_id=p.id),0),'paid_subscriptions',(select count(*) from public.subscriptions where plan_id<>'free' and status in ('active','trialing') and period_end>now()));
end $$;
create function private.admin_reports() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin perform private.require_admin();
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into result from (select * from public.reports order by created_at desc limit 200)r; return result;
end $$;
create function private.admin_moderate(p_target uuid,p_action text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_admin(); begin
 if p_action is null or p_action not in ('suspend','restore','dismiss_reports') or p_reason is null or length(btrim(p_reason)) not between 3 and 1000 then raise exception 'invalid_moderation' using errcode='22023'; end if;
 perform 1 from public.profiles where id=p_target for update;
 if not found then raise exception 'unknown_user'; end if;
 if p_action='suspend' then update public.profiles set status='suspended',boost_until=null where id=p_target and status<>'deleting'; end if;
 if p_action='restore' then update public.profiles set status='active' where id=p_target and status='suspended'; end if;
 if p_action='dismiss_reports' then update public.reports set status='reviewed' where target_id=p_target; end if;
 insert into private.audit_log(actor_id,target_id,action,reason) values(u,p_target,p_action,p_reason);
 return jsonb_build_object('ok',true);
end $$;
create function private.admin_save_plan(p_plan jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_admin(true); p public.plans; begin
 insert into public.plans(id,daily_likes,daily_superlikes,rewind,see_likes,monthly_boosts,boost_minutes,price_cents,currency,stripe_price_id,active)
 values(p_plan->>'id',(p_plan->>'daily_likes')::int,(p_plan->>'daily_superlikes')::int,(p_plan->>'rewind')::boolean,(p_plan->>'see_likes')::boolean,(p_plan->>'monthly_boosts')::int,(p_plan->>'boost_minutes')::int,coalesce((p_plan->>'price_cents')::int,0),coalesce(p_plan->>'currency','EUR'),p_plan->>'stripe_price_id',coalesce((p_plan->>'active')::boolean,true))
 on conflict(id) do update set daily_likes=excluded.daily_likes,daily_superlikes=excluded.daily_superlikes,rewind=excluded.rewind,see_likes=excluded.see_likes,monthly_boosts=excluded.monthly_boosts,boost_minutes=excluded.boost_minutes,price_cents=excluded.price_cents,currency=excluded.currency,stripe_price_id=excluded.stripe_price_id,active=excluded.active returning * into p;
 if p.id='free' and not p.active then raise exception 'free_plan_required'; end if;
 if p.stripe_price_id is not null then
 insert into public.plan_prices(stripe_price_id,plan_id,price_cents,currency) values(p.stripe_price_id,p.id,p.price_cents,p.currency) on conflict(stripe_price_id) do nothing;
 if not exists(select 1 from public.plan_prices h where h.stripe_price_id=p.stripe_price_id and h.plan_id=p.id and h.price_cents=p.price_cents and h.currency=p.currency) then
 raise exception 'stripe_price_mapping_conflict' using errcode='23514'; end if;
 end if;
 insert into private.audit_log(actor_id,action,reason) values(u,'save_plan',p.id); return to_jsonb(p);
end $$;
create function private.admin_save_city(p_city jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_admin(true); c public.cities; begin
 insert into public.cities(id,name,country,latitude,longitude,active) values(p_city->>'id',p_city->>'name',upper(p_city->>'country'),(p_city->>'latitude')::numeric,(p_city->>'longitude')::numeric,coalesce((p_city->>'active')::boolean,true))
 on conflict(id) do update set name=excluded.name,country=excluded.country,latitude=excluded.latitude,longitude=excluded.longitude,active=excluded.active returning * into c;
 insert into private.audit_log(actor_id,action,reason) values(u,'save_city',c.id); return to_jsonb(c);
end $$;
create function private.export_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(false,true); begin
 return jsonb_build_object('profile',(select to_jsonb(p) from public.profiles p where p.id=u)||coalesce((select jsonb_build_object('dob',dob) from private.identities where user_id=u),'{}'::jsonb),
 'decisions',coalesce((select jsonb_agg(to_jsonb(d)) from public.decisions d where user_id=u),'[]'::jsonb),
 'matches',coalesce((select jsonb_agg(to_jsonb(m)) from public.matches m where u in(user_a,user_b)),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(to_jsonb(m)) from public.messages m where exists(select 1 from public.matches x where x.id=m.match_id and u in(x.user_a,x.user_b))),'[]'::jsonb),
 'blocks',coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where user_id=u),'[]'::jsonb),
 'reports',coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where reporter_id=u),'[]'::jsonb),
 'subscription',(select to_jsonb(s) from public.subscriptions s where user_id=u),
 'consents',coalesce((select jsonb_agg(to_jsonb(c)) from public.consents c where user_id=u),'[]'::jsonb),
 'photos',coalesce((select jsonb_agg(to_jsonb(p)) from public.photos p where user_id=u),'[]'::jsonb));
end $$;
create function private.request_deletion() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.actor(false); requested timestamptz; purge timestamptz; begin
 perform 1 from public.profiles where id=u for update;
 if not found then raise exception 'profile_required'; end if;
 update private.identities set deletion_requested_at=coalesce(deletion_requested_at,now()),purge_after=coalesce(purge_after,now()+make_interval(days=>(select deletion_days from private.retention_config))) where user_id=u returning deletion_requested_at,purge_after into requested,purge;
 update public.profiles set status='deleting',boost_until=null where id=u;
 insert into private.billing_cancellations(user_id,customer_id,subscription_id) select user_id,customer_id,subscription_id from private.billing_accounts where user_id=u and subscription_id is not null on conflict(subscription_id) do nothing;
 update public.matches set ended_at=coalesce(ended_at,now()) where u in(user_a,user_b);
 insert into private.storage_deletions(path) select path from public.photos where user_id=u on conflict do nothing;
 return jsonb_build_object('requested_at',requested,'purge_after',purge);
end $$;
create function private.purge_deleted_accounts() returns jsonb language plpgsql security definer set search_path='' as $$
declare r record; n int:=0; begin perform private.require_service();
 for r in select p.id from public.profiles p join private.identities i on i.user_id=p.id where p.status='deleting' and i.purge_after<=now() order by p.id for update of p skip locked loop
 insert into private.storage_deletions(path) select path from public.photos where user_id=r.id on conflict do nothing;
 -- Retain only non-identifying reason/status of abuse reports; free text can contain personal information.
 update public.reports set details='',reporter_id=case when reporter_id=r.id then null else reporter_id end,target_id=case when target_id=r.id then null else target_id end where reporter_id=r.id or target_id=r.id;
 update private.audit_log set actor_id=case when actor_id=r.id then null else actor_id end,target_id=case when target_id=r.id then null else target_id end,reason=null where actor_id=r.id or target_id=r.id;
 update private.billing_events set user_id=null where user_id=r.id;
 delete from private.admin_roles where user_id=r.id;
 insert into private.auth_deletions(user_id) values(r.id) on conflict do nothing;
 delete from public.profiles where id=r.id; n:=n+1;
 end loop; return jsonb_build_object('purged',n);
end $$;
create function private.storage_cleanup_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin perform private.require_service(); select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into r from (select id,path from private.storage_deletions order by created_at limit 100)q; return r; end $$;
create function private.ack_storage_cleanup(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_service(); delete from private.storage_deletions where id=any(p_ids); return jsonb_build_object('ok',true); end $$;
create function private.auth_deletion_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin perform private.require_service(); select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into r from (select * from private.auth_deletions order by created_at limit 100)q; return r; end $$;
create function private.ack_auth_deletion(p_users uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_service(); delete from private.auth_deletions where user_id=any(p_users); return jsonb_build_object('ok',true); end $$;
create function private.retention_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.retention_config; begin perform private.require_service(); select * into c from private.retention_config;
 delete from public.reports where created_at<now()-make_interval(days=>c.report_days);
 delete from private.billing_events where received_at<now()-make_interval(days=>c.billing_days);
 delete from private.audit_log where created_at<now()-make_interval(days=>c.audit_days);
 delete from private.usage_counters where length(period)=10 and period<to_char(now()-interval '32 days','YYYY-MM-DD') or length(period)=7 and period<to_char(now()-interval '2 months','YYYY-MM');
 return jsonb_build_object('ok',true); end $$;

create function private.is_admin() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(false); r text; begin select role into r from private.admin_roles where user_id=u; return jsonb_build_object('is_admin',r is not null,'role',r); end $$;
create function private.billing_account(p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin perform private.require_service(); select jsonb_build_object('customer_id',customer_id,'subscription_id',subscription_id) into r from private.billing_accounts where user_id=p_user; return r; end $$;
create function private.billing_cancellation_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; begin perform private.require_service(); select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into r from (select * from private.billing_cancellations order by created_at limit 100)q; return r; end $$;
create function private.ack_billing_cancellation(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_service(); delete from private.billing_cancellations where id=any(p_ids); return jsonb_build_object('ok',true); end $$;
-- Thin SECURITY INVOKER API wrappers. Generate from a fixed explicit allowlist only.
do $$ declare f record; args text; callargs text; clientrole text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=any(array[
 'billing_cancellation_queue','ack_billing_cancellation','is_admin','billing_account','complete_onboarding','update_profile','my_profile','discover','decide','rewind','boost','who_liked_me','list_matches','get_messages','send_message','mark_read','block_user','unmatch','report_user','reserve_photo','remove_photo','export_data','request_deletion','admin_metrics','admin_reports','admin_moderate','admin_save_plan','admin_save_city',
 'apply_billing_event','purge_deleted_accounts','storage_cleanup_queue','ack_storage_cleanup','auth_deletion_queue','ack_auth_deletion','retention_cleanup']) loop
 args:=pg_get_function_arguments(f.oid);
 select coalesce(string_agg(quote_ident(x),','),'') into callargs from pg_proc p,unnest(p.proargnames) x where p.oid=f.oid;
 execute format('create function public.%I(%s) returns jsonb language sql security invoker set search_path='''' as %L',f.proname,args,format('select private.%I(%s)',f.proname,callargs));
 clientrole:=case when f.proname=any(array['billing_cancellation_queue','ack_billing_cancellation','billing_account','apply_billing_event','purge_deleted_accounts','storage_cleanup_queue','ack_storage_cleanup','auth_deletion_queue','ack_auth_deletion','retention_cleanup']) then 'service_role' else 'authenticated' end;
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',f.proname,pg_get_function_identity_arguments(f.oid));
 execute format('grant execute on function private.%I(%s) to %I',f.proname,pg_get_function_identity_arguments(f.oid),clientrole);
 execute format('grant execute on function public.%I(%s) to %I',f.proname,pg_get_function_identity_arguments(f.oid),clientrole);
 end loop;
end $$;
-- Only policy predicates are callable besides the checked operation helpers.
revoke all on function private.actor(boolean,boolean),private.blocked(uuid,uuid),private.can_chat(uuid,uuid),private.plan_for(uuid),private.distance(text,text),private.eligible(uuid,uuid,boolean),private.card(uuid,uuid),private.require_admin(boolean),private.require_service() from public,anon,authenticated,service_role;
grant execute on function private.chat_access(uuid),private.photo_access(text,boolean) to authenticated;
revoke all on function private.chat_access(uuid),private.photo_access(text,boolean) from public,anon;

-- Enable this hook in Auth before allowing public signups (see config.toml).
create function private.before_user_created(event jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d date; begin
 if current_user <> 'supabase_auth_admin' then raise exception 'auth_hook_only' using errcode='42501'; end if;
 begin d:=(event->'user'->'user_metadata'->>'dob')::date;
 exception when others then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','Informe uma data de nascimento válida.')); end;
 if coalesce((event->'user'->>'is_anonymous')::boolean,false) or d is null or d>current_date-interval '18 years' or d<current_date-interval '120 years' then
 return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','É necessário ter pelo menos 18 anos.'));
 end if;
 return '{}'::jsonb;
end $$;
create function public.before_user_created(event jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.before_user_created(event); $$;
revoke all on function private.before_user_created(jsonb),public.before_user_created(jsonb) from public,anon,authenticated,service_role;
grant usage on schema private,public to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb),public.before_user_created(jsonb) to supabase_auth_admin;
