import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { newSeries, recordRound, isFinalRound, roundSeed } from '../.test-build/game/series.js'

test('first to two round wins takes the match, 2-0 and 2-1', () => {
  let s = recordRound(recordRound(newSeries(), 'player'), 'player')
  assert.deepEqual([s.wins.player, s.wins.ai, s.winner], [2, 0, 'player'])
  s = recordRound(newSeries(), 'player'); s = recordRound(s, 'ai')
  assert.equal(s.winner, null); assert.equal(isFinalRound(s), true); assert.equal(s.round, 3)
  s = recordRound(s, 'ai')
  assert.deepEqual([s.wins.player, s.wins.ai, s.winner], [1, 2, 'ai'])
})
test('draws are void, replayed with a new seed, and results after the match are ignored', () => {
  let s = recordRound(newSeries(), 'draw')
  assert.deepEqual([s.round, s.wins.player, s.wins.ai], [1, 0, 0])
  assert.notEqual(roundSeed(7, s.attempt), roundSeed(7, 0)); assert.equal(roundSeed(7, 0), 7)
  s = recordRound(recordRound(s, 'ai'), 'ai')
  assert.equal(recordRound(s, 'player'), s)
})
