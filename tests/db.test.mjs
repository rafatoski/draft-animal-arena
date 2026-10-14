import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { runOnlineMatch } from '../.test-build/game/onlineSim.js'

// Real PostgreSQL (PGlite) with Supabase's auth schema stubbed: roles, auth.users, auth.uid().
// This exercises our SQL, RLS and functions; it is not a substitute for a smoke test on the hosted project.
const db = new PGlite()
const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c'
const Z = '00000000-0000-4000-8000-0000000000aa' // an anonymous (guest-type) auth user: must never reach rooms or persistent rewards
const asUser = async (id, role = 'authenticated') => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${id ?? ''}', false); set role ${role}`) }
const asService = () => db.exec('reset role; set role service_role')
const q = async (sql, params) => (await db.query(sql, params)).rows
const unlockAll = (id) => db.exec(`reset role; insert into public.player_fighters (player_id, fighter_id) select '${id}', f from unnest(public.valid_fighters()) f on conflict do nothing`)
const fails = async (sql, pattern) => assert.rejects(() => db.query(sql), pattern)

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, is_anonymous boolean default false, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to public;`)
  for (const file of readdirSync('supabase/migrations').sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await db.exec(`insert into auth.users (id, is_anonymous) values ('${A}', false), ('${B}', false), ('${Z}', true);
    insert into auth.users (id, is_anonymous, raw_user_meta_data) values ('${C}', false, '{"full_name":"Casey Google","avatar_url":"https://x/y.png"}')`)
  await unlockAll(A); await unlockAll(B) // these players stand in for people who already own every fighter
})

test('every auth user gets one profile and one progress row; Google keeps its name, with a safe fallback', async () => {
  await db.exec('reset role')
  const profiles = Object.fromEntries((await q('select id, display_name, account_type from public.profiles')).map(r => [r.id, r]))
  assert.equal(Object.keys(profiles).length, 4) // one per auth user: no duplicates
  assert.deepEqual([profiles[C].display_name, profiles[C].account_type], ['Casey Google', 'google'])
  assert.match(profiles[A].display_name, /^Player \d{4}$/); assert.equal(profiles[A].account_type, 'google') // Google without a name: safe fallback
  assert.match(profiles[Z].display_name, /^Guest \d{4}$/); assert.equal(profiles[Z].account_type, 'guest')
  assert.equal((await q('select count(*)::int n from public.player_progress'))[0].n, 4)
  assert.equal((await q('select coins from public.player_progress where player_id = $1', [A]))[0].coins, 0)
})

test('anonymous / guest-type users cannot open or join rooms, so they can never reach ranked play or online rewards', async () => {
  await asUser(A); const open = (await q('select * from public.create_room()'))[0]
  await asUser(Z); await fails('select * from public.create_room()', /sign in with Google/)
  await asUser(Z); await fails(`select * from public.join_room('${open.room_code}')`, /sign in with Google/)
  await db.exec(`reset role; delete from public.multiplayer_rooms where id = '${open.id}'`) // our own test room, not player data
})

test('players edit only their own name and avatar, and never their progression', async () => {
  await asUser(A)
  await db.exec("update public.profiles set display_name = 'Alpha' where id = '" + A + "'")
  assert.equal((await q(`select display_name from public.profiles where id = '${A}'`))[0].display_name, 'Alpha')
  await fails(`update public.profiles set account_type = 'google' where id = '${A}'`, /permission denied/)
  await fails(`update public.profiles set display_name = 'x' where id = '${A}'`, /check constraint/)
  assert.equal((await db.query(`update public.profiles set display_name = 'Hacked' where id = '${C}'`)).affectedRows, 0)
  await fails(`update public.player_progress set coins = 999999 where player_id = '${A}'`, /permission denied/)
  await fails(`insert into public.player_progress (player_id) values ('${C}')`, /permission denied/)
  assert.deepEqual((await q('select player_id from public.player_progress')).map(r => r.player_id), [A]) // only own row visible
  await fails("insert into public.matches (player_1_id, player_2_id, team_1, team_2, match_seed, combat_seed) values ('" + A + "','" + B + "','{chicken,fox,pig}','{chicken,fox,pig}',1,1)", /permission denied/)
  await fails(`insert into public.reward_ledger (match_id, player_id, coins, diamonds, ranking_delta) values (gen_random_uuid(), '${A}', 3, 2, 25)`, /permission denied/)
})

let room
test('rooms: create, join by code, capacity of two, no self-join', async () => {
  await asUser(A); room = (await q('select * from public.create_room()'))[0]
  assert.match(room.room_code, /^[A-HJ-NP-Z2-9]{6}$/); assert.equal(room.status, 'waiting'); assert.equal(room.host_player_id, A)
  await asUser(A); await fails(`select * from public.join_room('${room.room_code}')`, /host of this room/)
  const typed = ` ${room.room_code.slice(0, 3).toLowerCase()}-${room.room_code.slice(3).toLowerCase()} ` // people type codes in any case, with spaces or dashes
  await asUser(B); const joined = (await q(`select * from public.join_room('${typed}')`))[0]
  assert.deepEqual([joined.status, joined.guest_player_id], ['lobby', B])
  await asUser(B); assert.equal((await q(`select * from public.join_room('${room.room_code}')`))[0].guest_player_id, B) // idempotent
  await asUser(C); await fails(`select * from public.join_room('${room.room_code}')`, /room is full/)
  await asUser(C); await fails(`select * from public.join_room('ZZZZZ')`, /room not found/)
  await asService(); assert.equal((await q('select count(*)::int n from public.room_players where room_id = $1', [room.id]))[0].n, 2)
})

test('room privacy and direct writes are blocked', async () => {
  await asUser(C)
  assert.equal((await q('select * from public.multiplayer_rooms')).length, 0)
  assert.equal((await q('select * from public.room_players')).length, 0)
  await fails(`update public.multiplayer_rooms set status = 'finished' where id = '${room.id}'`, /permission denied/)
  await fails(`update public.room_players set ready = true where room_id = '${room.id}'`, /permission denied/)
  await fails(`select public.set_ready('${room.id}', true)`, /not in this room/)
  await fails(`select public.set_team('${room.id}', '{chicken,fox,pig}')`, /not in this room/)
  await asUser(A); assert.equal((await q('select * from public.multiplayer_rooms')).length, 1)
  assert.equal((await q('select * from public.room_players')).length, 2) // a member sees both seats
  await asUser(null, 'anon'); await fails('select * from public.multiplayer_rooms', /permission denied/)
})

test('team validation and ready rules', async () => {
  await asUser(A)
  await fails(`select public.set_ready('${room.id}', true)`, /pick your team first/)
  await fails(`select public.set_team('${room.id}', '{chicken,chicken,pig}')`, /three different/)
  await fails(`select public.set_team('${room.id}', '{chicken,fox}')`, /three different/)
  await fails(`select public.set_team('${room.id}', '{chicken,fox,dragon}')`, /three different/)
  await db.query(`select public.set_team('${room.id}', '{chicken,fox,pig}')`); await db.query(`select public.set_team('${room.id}', '{chicken,fox,frog}')`) // free to change until READY
  await db.query(`select public.set_ready('${room.id}', true)`)
  assert.equal((await q(`select ready from public.room_players where player_id = '${A}' and room_id = '${room.id}'`))[0].ready, true)
  await fails(`select public.set_team('${room.id}', '{chicken,fox,pig}')`, /selection locked/) // READY locks the selection
  await fails(`select public.set_ready('${room.id}', false)`, /selection locked/)
  await db.exec(`reset role; update public.room_players set ready = false where room_id = '${room.id}'`) // keep later tests' starting point
})

test('the fighter whitelist in SQL matches the game', () => {
  const source = readFileSync('src/game/fighters.ts', 'utf8')
  const ids = [...source.matchAll(/\{ id: '(\w+)', name:/g)].map(m => m[1]).filter(id => !id.startsWith('robot'))
  const sql = readFileSync('supabase/migrations/20261014000001_online_foundation.sql', 'utf8').match(/array\[([^\]]+)\]/)[1]
  assert.deepEqual(ids.sort(), sql.replace(/'/g, '').split(',').map(s => s.trim()).sort())
})

let match
test('only the service role can start a match, only when both are ready, and only once', async () => {
  await asUser(A); await fails(`select * from public.begin_match('${room.id}', '${A}')`, /permission denied/)
  await asUser(A); await db.query(`select public.set_team('${room.id}', '{chicken,fox,pig}')`)
  await asUser(B); await db.query(`select public.set_team('${room.id}', '{frog,capybara,raccoon}')`)
  await asService()
  await fails(`select * from public.begin_match('${room.id}', '${A}')`, /both players must be ready/)
  await asUser(A); await db.query(`select public.set_ready('${room.id}', true)`)
  await asUser(B); await db.query(`select public.set_ready('${room.id}', true)`)
  await asService()
  await fails(`select * from public.begin_match('${room.id}', '${C}')`, /not in this room/)
  match = (await q(`select * from public.begin_match('${room.id}', '${B}')`))[0]
  assert.equal(match.created, true); assert.deepEqual(match.team_1, ['chicken', 'fox', 'pig']); assert.deepEqual(match.team_2, ['frog', 'capybara', 'raccoon'])
  const again = (await q(`select * from public.begin_match('${room.id}', '${A}')`))[0]
  assert.equal(again.created, false); assert.equal(again.match_id, match.match_id)
  assert.equal((await q('select count(*)::int n from public.matches'))[0].n, 1)
  assert.equal((await q(`select status from public.multiplayer_rooms where id = '${room.id}'`))[0].status, 'in_match')
})

test('results are paid exactly once, atomically, and cannot be forged by players', async () => {
  const events = JSON.stringify([{ round: 1, events: [{ type: 'end', winner: 'player' }] }, { round: 2, events: [{ type: 'end', winner: 'player' }] }])
  await asUser(A); await fails(`select * from public.finalize_match('${match.match_id}', 1::smallint, 2, 0, 2, 500, '[]', 'h')`, /permission denied/)
  await asService()
  await fails(`select * from public.finalize_match('${match.match_id}', 1::smallint, 1, 1, 2, 500, '[]', 'h')`, /invalid result/)
  const done = (await q(`select * from public.finalize_match('${match.match_id}', 1::smallint, 2, 0, 2, 500, '${events}', 'abc')`))[0]
  assert.deepEqual([done.match_status, done.winner_id, done.score_1], ['finished', A, 2])
  await q(`select * from public.finalize_match('${match.match_id}', 2::smallint, 0, 2, 2, 500, '[]', 'zzz')`) // retry with a different claim: ignored
  const p = Object.fromEntries((await q('select * from public.player_progress where player_id in ($1, $2)', [A, B])).map(r => [r.player_id, r]))
  assert.ok(p[A].coins >= 1 && p[A].coins <= 3 && p[A].diamonds >= 1 && p[A].diamonds <= 2, 'winner: 1-3 coins, 1-2 diamonds')
  assert.deepEqual([p[A].ranking_points, p[A].wins, p[A].losses, p[A].total_matches], [25, 1, 0, 1])
  assert.deepEqual([p[B].coins, p[B].diamonds, p[B].ranking_points, p[B].wins, p[B].losses, p[B].total_matches], [0, 0, 0, 0, 1, 1]) // a defeat pays nothing
  assert.equal((await q('select count(*)::int n from public.reward_ledger'))[0].n, 2)
  assert.equal((await q('select count(*)::int n from public.match_events'))[0].n, 2)
  assert.equal((await q(`select status from public.multiplayer_rooms where id = '${room.id}'`))[0].status, 'finished')
  await asUser(A); assert.equal((await q('select match_status from public.matches'))[0].match_status, 'finished')
  await asUser(C); assert.equal((await q('select * from public.matches')).length, 0); assert.equal((await q('select * from public.match_events')).length, 0)
})

test('leaderboard is public, ranked, and only lists players who have played', async () => {
  await asUser(null, 'anon')
  const rows = await q('select position, player, ranking_points, wins, losses, total_matches from public.leaderboard order by position')
  assert.deepEqual(rows.map(r => [r.position, r.ranking_points, r.wins, r.losses]), [[1, 25, 1, 0], [2, 0, 0, 1]])
  assert.equal(rows[0].player, 'Alpha')
  const cols = (await q("select column_name from information_schema.columns where table_name = 'leaderboard'")).map(r => r.column_name).sort()
  assert.deepEqual(cols, ['losses', 'player', 'player_id', 'position', 'ranking_points', 'total_matches', 'wins']) // no coins, no xp, no account type
  await fails('select * from public.player_progress', /permission denied/)
})

test('rematch needs both players; leaving frees the room', async () => {
  await asUser(A); assert.equal((await q(`select public.rematch_room('${room.id}') r`))[0].r, false) // one vote is not enough
  assert.equal((await q(`select status from public.multiplayer_rooms where id = '${room.id}'`))[0].status, 'finished')
  await asUser(A); assert.equal((await q(`select public.rematch_room('${room.id}') r`))[0].r, false) // voting twice does not count twice
  await asUser(B); assert.equal((await q(`select public.rematch_room('${room.id}') r`))[0].r, true)
  assert.deepEqual([(await q(`select status from public.multiplayer_rooms where id = '${room.id}'`))[0].status, (await q('select bool_or(ready) or bool_or(rematch) r from public.room_players'))[0].r], ['lobby', false])
  await asUser(C); await fails(`select public.rematch_room('${room.id}')`, /not in this room/)
  await asUser(B); await db.query(`select public.leave_room('${room.id}')`)
  await asUser(A); const left = (await q(`select status, guest_player_id from public.multiplayer_rooms where id = '${room.id}'`))[0]
  assert.deepEqual([left.status, left.guest_player_id], ['waiting', null])
  await asUser(C); await db.query(`select * from public.join_room('${room.room_code}')`) // a third player can now take the seat
  await asUser(B); const fresh = (await q('select * from public.create_room()'))[0] // creating a room leaves other open rooms
  assert.notEqual(fresh.room_code, room.room_code)
})

test('stale-room and old-event cleanup is service-only', async () => {
  await asUser(A); await fails('select public.cleanup_stale_data()', /permission denied/)
  await asService(); await db.query(`update public.multiplayer_rooms set updated_at = now() - interval '3 hours' where status = 'waiting'`)
  await db.query('select public.cleanup_stale_data()')
  assert.equal((await q("select count(*)::int n from public.multiplayer_rooms where status = 'waiting' and updated_at < now() - interval '2 hours'"))[0].n, 0)
})

test('end to end: two players, server simulation, both clients replay the same result, one payout', async () => {
  const D = '00000000-0000-4000-8000-0000000000d1', E = '00000000-0000-4000-8000-0000000000e1'
  await db.exec(`reset role; insert into auth.users (id, is_anonymous) values ('${D}', false), ('${E}', false)`); await unlockAll(D); await unlockAll(E)
  await asUser(D); const r = (await q('select * from public.create_room()'))[0]
  await asUser(E); await db.query(`select * from public.join_room('${r.room_code}')`)
  await asUser(D); await db.query(`select public.set_team('${r.id}', '{raccoon,pig,frog}')`); await db.query(`select public.set_ready('${r.id}', true)`)
  await asUser(E); await db.query(`select public.set_team('${r.id}', '{fox,chicken,capybara}')`); await db.query(`select public.set_ready('${r.id}', true)`)

  // What the start-match Edge Function does, step by step.
  await asService()
  const m = (await q(`select * from public.begin_match('${r.id}', '${E}')`))[0]
  const server = runOnlineMatch(m.team_1, m.team_2, Number(m.combat_seed))
  await db.query('select * from public.finalize_match($1, $2::smallint, $3, $4, $5, $6, $7::jsonb, $8)',
    [m.match_id, server.winner, server.score[0], server.score[1], server.rounds, server.ticks, JSON.stringify(server.log.map(x => ({ round: x.round, events: x.events }))), server.hash])

  // Each player's browser reads the match row it is allowed to see and replays it locally.
  for (const id of [D, E]) {
    await asUser(id)
    const row = (await q('select * from public.matches'))[0]
    const replay = runOnlineMatch(row.team_1, row.team_2, Number(row.combat_seed))
    assert.equal(replay.hash, row.result_hash); assert.deepEqual([row.score_1, row.score_2], replay.score)
    assert.equal(row.winner_id, replay.winner === 1 ? D : E)
    assert.equal((await q('select count(*)::int n from public.match_events'))[0].n, server.rounds)
  }
  await asService()
  const wins = await q(`select player_id, wins, losses, coins, diamonds from public.player_progress where player_id in ('${D}', '${E}') order by wins desc`)
  assert.deepEqual([wins[0].wins, wins[1].losses, wins[1].coins, wins[1].diamonds], [1, 1, 0, 0])
  assert.ok(wins[0].coins >= 1 && wins[0].coins <= 3 && wins[0].diamonds >= 1 && wins[0].diamonds <= 2)
  const paid = wins[0].coins + wins[0].diamonds
  await db.query('select * from public.finalize_match($1, 1::smallint, 2, 0, 2, 1, \'[]\', \'x\')', [m.match_id]) // a retried finalize pays nothing
  assert.equal((await q(`select sum(coins + diamonds)::int c from public.player_progress where player_id in ('${D}', '${E}')`))[0].c, paid)
})

test('economy: starters are unlocked, the other three are locked, and nobody can write ownership or config', async () => {
  await db.exec('reset role')
  const owned = (await q(`select fighter_id from public.player_fighters where player_id = '${C}' order by fighter_id`)).map(r => r.fighter_id)
  assert.deepEqual(owned, ['capybara', 'chicken', 'frog'])
  assert.deepEqual(JSON.parse(JSON.stringify((await q('select config from public.economy_config'))[0].config)).starter_fighters, ['chicken', 'capybara', 'frog'])
  await asUser(C)
  await fails(`insert into public.player_fighters (player_id, fighter_id) values ('${C}', 'pig')`, /permission denied/)
  await fails(`update public.economy_config set config = '{}'`, /permission denied/)
  await fails(`insert into public.economy_transactions (player_id, currency, amount, transaction_type, reference_id) values ('${C}','coins',99,'match_reward','x')`, /permission denied/)
  await fails(`update public.player_progress set diamonds = 99 where player_id = '${C}'`, /permission denied/)
  assert.equal((await q('select count(*)::int n from public.economy_config'))[0].n, 1) // config is public to read
})

test('economy: locked fighters cannot be used in a room team, and diamonds buy them atomically', async () => {
  const F = '00000000-0000-4000-8000-0000000000f1', G = '00000000-0000-4000-8000-0000000000f2'
  await db.exec(`reset role; insert into auth.users (id, is_anonymous) values ('${F}', false), ('${G}', false)`)
  await asUser(F); const r = (await q('select * from public.create_room()'))[0]
  await asUser(G); await db.query(`select * from public.join_room('${r.room_code}')`)
  await asUser(F); await fails(`select public.set_team('${r.id}', '{chicken,capybara,pig}')`, /fighter not unlocked/)
  await db.query(`select public.set_team('${r.id}', '{chicken,capybara,frog}')`) // the starters are fine
  await asUser(F); await fails(`select public.unlock_fighter('pig')`, /not enough diamonds: need 10 more/)
  await fails(`select public.unlock_fighter('dragon')`, /unknown fighter/)
  await fails(`select public.unlock_fighter('chicken')`, /already unlocked|not enough/)
  await db.exec(`reset role; update public.player_progress set diamonds = 12 where player_id = '${F}'`)
  await asUser(F)
  const bought = (await q(`select public.unlock_fighter('pig') r`))[0].r
  assert.equal(bought.diamonds, 2)
  await fails(`select public.unlock_fighter('pig')`, /already unlocked/)                       // no double purchase
  await fails(`select public.unlock_fighter('fox')`, /not enough diamonds: need 8 more/)       // 2 left: balance never goes negative
  await db.query(`select public.set_team('${r.id}', '{chicken,capybara,pig}')`)                // now usable
  const rows = await q(`select currency, amount, transaction_type, reference_id from public.economy_transactions`)
  assert.deepEqual(rows, [{ currency: 'diamonds', amount: -10, transaction_type: 'fighter_unlock', reference_id: 'pig' }])
  await asUser(G); await fails(`select public.set_team('${r.id}', '{chicken,capybara,fox}')`, /fighter not unlocked/)
  assert.equal((await q(`select diamonds from public.player_progress`))[0].diamonds, 0)         // G sees only G
})

test('economy: a team with a fighter that is no longer owned cannot start a match', async () => {
  const H = '00000000-0000-4000-8000-0000000000a1', I = '00000000-0000-4000-8000-0000000000a2'
  await db.exec(`reset role; insert into auth.users (id, is_anonymous) values ('${H}', false), ('${I}', false); update public.player_progress set diamonds = 10 where player_id = '${H}'`)
  await asUser(H); const r = (await q('select * from public.create_room()'))[0]; await db.query(`select public.unlock_fighter('fox')`)
  await asUser(I); await db.query(`select * from public.join_room('${r.room_code}')`); await db.query(`select public.set_team('${r.id}', '{chicken,capybara,frog}')`); await db.query(`select public.set_ready('${r.id}', true)`)
  await asUser(H); await db.query(`select public.set_team('${r.id}', '{chicken,capybara,fox}')`); await db.query(`select public.set_ready('${r.id}', true)`)
  await db.exec(`reset role; delete from public.player_fighters where player_id = '${H}' and fighter_id = 'fox'`) // e.g. a refund / revoke after picking
  await asService(); await fails(`select * from public.begin_match('${r.id}', '${H}')`, /fighter not unlocked/)
})

const practice = (player, request, team, won) => q('select * from public.record_practice_match($1, $2, $3::text[], $4::text[], $5, $6)', [player, request, team, ['robot1', 'robot2', 'robot3'], 123456, won])
const progress = async (id) => (await q('select coins, diamonds, ranking_points, wins, losses, total_matches from public.player_progress where player_id = $1', [id]))[0]
const rewind = () => db.exec(`reset role; update public.practice_matches set created_at = created_at - interval '1 minute'`)
const T = ['chicken', 'capybara', 'frog']
let nextRequest = 0
const req = () => `10000000-0000-4000-8000-${String(++nextRequest).padStart(12, '0')}`

test('practice rewards: a win pays 1-3 coins and never diamonds, ranking or online stats; a loss pays nothing', async () => {
  await asService(); const before = await progress(A)
  const won = (await practice(A, req(), T, true))[0]
  assert.ok(won.coins >= 1 && won.coins <= 3 && !won.limited)
  const after = await progress(A)
  assert.equal(after.coins - before.coins, won.coins)
  assert.deepEqual([after.diamonds, after.ranking_points, after.wins, after.losses, after.total_matches], [before.diamonds, before.ranking_points, before.wins, before.losses, before.total_matches])
  await rewind()
  const lost = (await practice(A, req(), T, false))[0]
  assert.equal(lost.coins, 0); assert.deepEqual(await progress(A), after)
  assert.deepEqual((await q(`select currency, transaction_type, amount from public.economy_transactions where player_id = '${A}' and transaction_type = 'practice_reward'`)).map(r => [r.currency, r.amount]), [['coins', won.coins]])
})

test('practice rewards: the amount is always within 1-3 and varies', async () => {
  await asService(); const seen = new Set()
  for (let i = 0; i < 40; i++) { await rewind(); seen.add((await practice(B, req(), T, true))[0].coins) }
  assert.ok([...seen].every(c => c >= 1 && c <= 3)); assert.ok(seen.size >= 2)
  assert.equal((await progress(B)).diamonds, 0)
})

test('practice rewards: a retried request id never pays twice; rapid new requests and the hourly cap are limited', async () => {
  await asService(); await rewind()
  const id = req(), first = (await practice(C, id, T, true))[0], before = await progress(C)
  const retry = (await practice(C, id, T, true))[0]
  assert.equal(retry.id, first.id); assert.deepEqual(await progress(C), before)
  const rapid = (await practice(C, req(), T, true))[0] // a different request seconds later
  assert.deepEqual([rapid.coins, rapid.limited], [0, true]); assert.deepEqual(await progress(C), before)
  await rewind(); await db.exec(`update public.economy_config set config = jsonb_set(config, '{practice_limits,per_hour}', '1')`)
  assert.equal((await practice(C, req(), T, true))[0].limited, true) // hourly cap reached
  await db.exec(`update public.economy_config set config = jsonb_set(config, '{practice_limits,per_hour}', '60')`)
})

test('practice rewards: guests, locked fighters and the public API are rejected', async () => {
  await asService()
  await fails(`select * from public.record_practice_match('${Z}', gen_random_uuid(), '{chicken,capybara,frog}', '{robot1,robot2,robot3}', 1, true)`, /sign in with Google/)
  await fails(`select * from public.record_practice_match('${C}', gen_random_uuid(), '{chicken,capybara,pig}', '{robot1,robot2,robot3}', 1, true)`, /invalid team/)
  await fails(`select * from public.record_practice_match('${C}', gen_random_uuid(), '{chicken,chicken,frog}', '{robot1,robot2,robot3}', 1, true)`, /invalid team/)
  await asUser(C); await fails(`select * from public.record_practice_match('${C}', gen_random_uuid(), '{chicken,capybara,frog}', '{robot1,robot2,robot3}', 1, true)`, /permission denied/)
  await fails(`insert into public.practice_matches (player_id, request_id, team, robot_team, combat_seed, player_won, coins) values ('${C}', gen_random_uuid(), '{a}', '{b}', 1, true, 3)`, /permission denied/)
  await fails(`update public.player_progress set coins = coins + 3 where player_id = '${C}'`, /permission denied/)
  assert.ok((await q('select * from public.practice_matches')).every(r => r.player_id === C)) // own rows only
  await asUser(null, 'anon'); await fails('select * from public.practice_matches', /permission denied/)
})

test('quick match: two distinct players are paired once, nobody matches themselves, cancel and stale entries clean up', async () => {
  const [Q1, Q2, Q3, Q4] = [1, 2, 3, 4].map(n => `20000000-0000-4000-8000-00000000000${n}`)
  await db.exec(`reset role; insert into auth.users (id, is_anonymous) values ${[Q1, Q2, Q3, Q4].map(id => `('${id}', false)`).join(', ')}`)
  await asUser(Z); await fails('select public.quick_match()', /sign in with Google/)
  await asUser(null, 'anon'); await fails('select public.quick_match()', /permission denied/)
  await asUser(Q1); assert.equal((await q('select public.quick_match() r'))[0].r.state, 'searching')
  await asUser(Q1); assert.equal((await q('select public.quick_match() r'))[0].r.state, 'searching') // polling again: still alone, never self-matched
  await asService(); assert.equal((await q('select count(*)::int n from public.matchmaking_queue'))[0].n, 1)
  await asUser(Q2); const second = (await q('select public.quick_match() r'))[0].r
  assert.equal(second.state, 'matched'); assert.deepEqual([second.room.host_player_id, second.room.guest_player_id, second.room.status, second.room.quick], [Q1, Q2, 'lobby', true])
  await asUser(Q1); const first = (await q('select public.quick_match() r'))[0].r // the waiting player's next poll learns of the room
  assert.equal(first.state, 'matched'); assert.equal(first.room.id, second.room.id)
  await asService(); assert.equal((await q('select count(*)::int n from public.matchmaking_queue'))[0].n, 0)
  assert.equal((await q('select count(*)::int n from public.room_players where room_id = $1', [second.room.id]))[0].n, 2)
  assert.equal((await q('select count(*)::int n from public.multiplayer_rooms where quick'))[0].n, 1) // exactly one room for the pair
  await asUser(Q2); assert.equal((await q('select (public.my_active_room()).id i'))[0].i, second.room.id)

  await asUser(Q3); assert.equal((await q('select public.quick_match() r'))[0].r.state, 'searching')
  await db.query('select public.cancel_quick_match()')
  await asService(); assert.equal((await q('select count(*)::int n from public.matchmaking_queue'))[0].n, 0) // cancel leaves the line
  await asUser(Q3); await db.query('select public.quick_match()')
  await asService(); await db.query(`update public.matchmaking_queue set seen_at = now() - interval '1 minute'`) // Q3 closed the tab
  await asUser(Q4); assert.equal((await q('select public.quick_match() r'))[0].r.state, 'searching') // does not get paired with a ghost
  await asService(); assert.deepEqual((await q('select player_id from public.matchmaking_queue')).map(r => r.player_id), [Q4])
  await asUser(Q4); await db.query('select public.cancel_quick_match()')
  await asService(); await fails('select public.quick_match()', /permission denied/) // players only, never the service role
})

test('selection deadline: set by the server clock, final selection is server-validated and auto-filled with owned fighters only', async () => {
  const [S1, S2, S3] = [1, 2, 3].map(n => `30000000-0000-4000-8000-00000000000${n}`)
  await db.exec(`reset role; insert into auth.users (id, is_anonymous) values ('${S1}', false), ('${S2}', false), ('${S3}', false)`)
  await asUser(S1); const r = (await q('select * from public.create_room()'))[0]
  assert.equal(r.selection_deadline, null) // alone in the room: no countdown yet
  await asUser(S2); const joined = (await q(`select * from public.join_room('${r.room_code}')`))[0]
  const left = new Date(joined.selection_deadline).getTime() - Date.now()
  assert.ok(left > 28000 && left <= 30500, `deadline should be ~30s away, was ${left}`)
  await asUser(S1); assert.equal(typeof (await q('select public.server_time() t'))[0].t.getTime, 'function')
  await fails(`select public.finalize_selection('${r.id}')`, /selection time is not over/) // clients cannot end the countdown early
  await asUser(S3); await fails(`select public.finalize_selection('${r.id}')`, /not in this room/)
  await asUser(S1); await fails(`select public.set_team('${r.id}', '{chicken,capybara,pig}')`, /fighter not unlocked/) // locked fighters never selectable
  await db.query(`select public.set_team('${r.id}', '{frog,chicken,capybara}')`)
  await asUser(S2); await fails(`select public.save_draft('${r.id}', '{pig}')`, /fighter not unlocked/); await fails(`select public.save_draft('${r.id}', '{frog,frog}')`, /three different/)
  await db.query(`select public.save_draft('${r.id}', '{capybara}')`) // S2 picked one fighter before time ran out
  await asUser(S1)
  // S1 picked a full team but never pressed READY; S2 picked nothing. The deadline passes.
  await db.exec(`reset role; update public.multiplayer_rooms set selection_deadline = now() - interval '1 second' where id = '${r.id}'`)
  await asUser(S2); await fails(`select public.set_team('${r.id}', '{frog,chicken,capybara}')`, /selection time is over/)
  assert.equal((await q(`select public.finalize_selection('${r.id}') r`))[0].r, true)
  assert.equal((await q(`select public.finalize_selection('${r.id}') r`))[0].r, true) // repeatable, from either player
  await asService()
  const seats = await q(`select player_id, team_selection, ready from public.room_players where room_id = '${r.id}'`)
  const mine = Object.fromEntries(seats.map(s => [s.player_id, s]))
  assert.deepEqual([...mine[S1].team_selection].sort(), ['capybara', 'chicken', 'frog']) // the valid pick is kept
  assert.equal(mine[S2].team_selection.length, 3); assert.equal(new Set(mine[S2].team_selection).size, 3); assert.ok(mine[S2].team_selection.includes('capybara'), 'the partial pick is kept')
  assert.ok(mine[S2].team_selection.every(id => ['chicken', 'capybara', 'frog'].includes(id)), 'auto-fill uses unlocked fighters only') // S2 owns only the starters
  assert.ok(seats.every(s => s.ready)); assert.ok(seats.every(s => mine[s.player_id].team_selection.length === 3))
  const m = (await q(`select * from public.begin_match('${r.id}', '${S1}')`))[0] // both ready and validated: the match can start
  assert.equal(m.created, true)
})
