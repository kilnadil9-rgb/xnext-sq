-- Verification for profiles privileged-columns fix. Whole script ROLLS BACK.
begin;
create temp table _r(n serial, test text, result text) on commit drop;
grant all on _r to authenticated; grant usage on sequence _r_n_seq to authenticated;
do $t$
declare v_user uuid; v_admin uuid; v_cnt int; v_q uuid; v_creator uuid; v_u uuid[]; v_before int; v_after int; v_new uuid := gen_random_uuid(); i int;
begin
  select id into v_user from public.profiles where not is_admin order by created_at limit 1;
  select id into v_admin from public.profiles where is_admin limit 1;
  -- (1) regular user: is_admin
  perform set_config('request.jwt.claims', json_build_object('sub',v_user,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.profiles set is_admin=true where id=v_user; insert into _r(test,result) values('1a non-admin set is_admin','NOT BLOCKED (FAIL)');
  exception when others then insert into _r(test,result) values('1a non-admin set is_admin','blocked: '||sqlstate||' '||sqlerrm); end;
  begin update public.profiles set trust_score=trust_score+100 where id=v_user; insert into _r(test,result) values('1b non-admin set trust_score','NOT BLOCKED (FAIL)');
  exception when others then insert into _r(test,result) values('1b non-admin set trust_score','blocked: '||sqlstate||' '||sqlerrm); end;
  -- (3) ordinary edit
  begin update public.profiles set bio=coalesce(bio,'')||' ', full_name=full_name where id=v_user; get diagnostics v_cnt=row_count;
    insert into _r(test,result) values('3 non-admin edit bio/full_name','rows updated='||v_cnt);
  exception when others then insert into _r(test,result) values('3 non-admin edit bio','ERROR '||sqlerrm); end;
  -- non-admin cannot update another user's profile (unchanged RLS)
  update public.profiles set bio='x' where id=v_admin; get diagnostics v_cnt=row_count;
  insert into _r(test,result) values('1c non-admin edit other profile','rows updated='||v_cnt);
  execute 'reset role';
  -- (2) admin
  perform set_config('request.jwt.claims', json_build_object('sub',v_admin,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_cnt from public.profiles where id=v_admin and is_admin; insert into _r(test,result) values('2a admin is_admin=true',v_cnt::text);
  select count(*) into v_cnt from public.quests; insert into _r(test,result) values('2b admin sees quests (of all)',v_cnt||' / '||(select count(*) from pg_catalog.pg_class where false));
  update public.quests set updated_at=updated_at where created_by is distinct from v_admin; get diagnostics v_cnt=row_count;
  insert into _r(test,result) values('2c admin updates others'' quests rows',v_cnt::text);
  begin update public.profiles set bio=coalesce(bio,'')||' ' where id=v_admin; get diagnostics v_cnt=row_count; insert into _r(test,result) values('2d admin edits own bio','rows='||v_cnt);
  exception when others then insert into _r(test,result) values('2d admin edits own bio','ERROR '||sqlerrm); end;
  execute 'reset role';
  -- (4a) signup path: GoTrue inserts auth.users with no end-user JWT
  perform set_config('request.jwt.claims', '', true);
  begin
    insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (v_new, '00000000-0000-0000-0000-000000000000','authenticated','authenticated','rb-verify-'||v_new||'@invalid.test','{}'::jsonb, now(), now());
    select count(*) into v_cnt from public.profiles where id=v_new and not is_admin and trust_score=0;
    insert into _r(test,result) values('4a handle_new_user creates profile', 'profiles created='||v_cnt);
  exception when others then insert into _r(test,result) values('4a handle_new_user','ERROR '||sqlstate||' '||sqlerrm); end;
  -- (4b) trust-score trigger path: 3 completions by regular users verify a quest, creator +5
  select q.id, q.created_by into v_q, v_creator from public.quests q
   where q.status='published' and not coalesce(q.verified_location,false) and q.created_by is not null
     and not exists (select 1 from public.quest_completions c where c.quest_id=q.id) limit 1;
  select array_agg(id) into v_u from (select id from public.profiles where id<>v_creator and id<>v_new order by created_at limit 3) s;
  select trust_score into v_before from public.profiles where id=v_creator;
  begin
    for i in 1..3 loop
      perform set_config('request.jwt.claims', json_build_object('sub',v_u[i],'role','authenticated')::text, true);
      execute 'set local role authenticated';
      insert into public.quest_completions(user_id, quest_id) values (v_u[i], v_q);
      execute 'reset role';
    end loop;
    select trust_score into v_after from public.profiles where id=v_creator;
    insert into _r(test,result) values('4b trust trigger: creator trust delta', (v_after-v_before)::text||' (expect >=5); verified='||(select verified_location from public.quests where id=v_q));
  exception when others then execute 'reset role'; insert into _r(test,result) values('4b trust trigger','ERROR '||sqlstate||' '||sqlerrm); end;
end $t$;
select test, result from _r order by n;
rollback;
