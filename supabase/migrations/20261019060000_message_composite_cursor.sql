-- Incremental only: preserve get_messages for existing timestamp-only clients.
create function private.get_messages_page(p_match uuid, p_before timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.actor(); result jsonb;
begin
 if not private.can_chat(p_match,u) then raise exception 'match_forbidden' using errcode='42501'; end if;
 if p_before_id is not null and p_before is null then raise exception 'invalid_cursor' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by created_at,id),'[]'::jsonb) into result
 from (select * from public.messages where match_id=p_match and
   (p_before is null or (p_before_id is null and created_at<p_before)
    or (p_before_id is not null and (created_at,id)<(p_before,p_before_id)))
   order by created_at desc,id desc limit 100)q;
 return result;
end $$;
create function public.get_messages_page(p_match uuid, p_before timestamptz default null, p_before_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select private.get_messages_page(p_match,p_before,p_before_id)
$$;
revoke all on function private.get_messages_page(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_messages_page(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_messages_page(uuid,timestamptz,uuid) to authenticated;
grant execute on function public.get_messages_page(uuid,timestamptz,uuid) to authenticated;
