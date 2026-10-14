-- start-match runs the whole simulation inside one call, so by the time the second player's identical call arrives the
-- room is already 'finished'. begin_match must hand back the existing match then, not fail with 'room is not ready'.
-- Same signature and return type; only the "already started" condition widens. A rematch clears current_match_id, so it is unaffected.
create or replace function public.begin_match(p_room uuid, p_requester uuid)
returns table (match_id uuid, created boolean, player_1 uuid, player_2 uuid, team_1 text[], team_2 text[], match_seed bigint, combat_seed bigint, match_status text, bonus_1 jsonb, bonus_2 jsonb)
language plpgsql security definer set search_path = public as $$
declare room public.multiplayer_rooms; t1 text[]; t2 text[]; r1 boolean; r2 boolean; m public.matches; seed bigint;
begin
  select * into room from public.multiplayer_rooms where id = p_room for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if p_requester is distinct from room.host_player_id and p_requester is distinct from room.guest_player_id then
    raise exception 'not in this room' using errcode = '42501'; end if;
  if room.status in ('in_match', 'finished') and room.current_match_id is not null then
    select * into m from public.matches where id = room.current_match_id;
    return query select m.id, false, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status, m.bonus_1, m.bonus_2;
    return;
  end if;
  if room.status <> 'lobby' or room.guest_player_id is null then raise exception 'room is not ready' using errcode = 'P0001'; end if;
  select team_selection, ready into t1, r1 from public.room_players where room_id = p_room and player_id = room.host_player_id;
  select team_selection, ready into t2, r2 from public.room_players where room_id = p_room and player_id = room.guest_player_id;
  if not (coalesce(r1, false) and coalesce(r2, false)) or cardinality(t1) <> 3 or cardinality(t2) <> 3 then
    raise exception 'both players must be ready' using errcode = 'P0001'; end if;
  if not (public.owns_fighters(room.host_player_id, t1) and public.owns_fighters(room.guest_player_id, t2)) then
    raise exception 'fighter not unlocked' using errcode = '42501'; end if;
  seed := floor(random() * 4294967296)::bigint;
  insert into public.matches (room_id, player_1_id, player_2_id, team_1, team_2, match_seed, combat_seed, bonus_1, bonus_2)
  values (p_room, room.host_player_id, room.guest_player_id, t1, t2, seed, floor(random() * 4294967296)::bigint,
          public.team_bonus(room.host_player_id, t1), public.team_bonus(room.guest_player_id, t2))
  returning * into m;
  update public.multiplayer_rooms set status = 'in_match', current_match_id = m.id where id = p_room;
  return query select m.id, true, m.player_1_id, m.player_2_id, m.team_1, m.team_2, m.match_seed, m.combat_seed, m.match_status, m.bonus_1, m.bonus_2;
end $$;
