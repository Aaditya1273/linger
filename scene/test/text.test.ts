import assert from 'assert'
import { describe, it } from 'node:test'
import { forDisplay, NAME_MAX } from '../src/linger/ui/text'

/**
 * Regression tests for the mobile text-overflow defect.
 *
 * The server caps display names at 40 characters and react-ecs `uiText` defaults to
 * `textWrap: 'wrap'`, so before this fix a long name wrapped onto extra lines inside a
 * fixed-height container and overlapped the text beneath it — worst on the Bond card,
 * where names render at 34 px in a 44 px box.
 */

describe('forDisplay — mobile name truncation', () => {
  it('leaves a normal Decentraland name untouched', () => {
    assert.strictEqual(forDisplay('Aaditya#a1b2'), 'Aaditya#a1b2')
  })

  it('bounds the 40-character name the server allows', () => {
    // 40 chars is exactly what normaliseIdentity permits through.
    const longest = 'x'.repeat(40)
    assert.strictEqual(forDisplay(longest).length, NAME_MAX)
  })

  it('never exceeds NAME_MAX for any input length', () => {
    for (let n = 0; n <= 200; n++) {
      assert.ok(
        forDisplay('a'.repeat(n)).length <= NAME_MAX,
        `a ${n}-character name must not exceed ${NAME_MAX}`
      )
    }
  })

  it('marks truncation visibly', () => {
    assert.ok(forDisplay('y'.repeat(40)).endsWith('…'))
  })

  it('does not add an ellipsis when it did not truncate', () => {
    assert.strictEqual(forDisplay('short'), 'short')
  })

  it('keeps a name of exactly NAME_MAX intact', () => {
    const exact = 'z'.repeat(NAME_MAX)
    assert.strictEqual(forDisplay(exact), exact)
  })

  it('falls back for empty, blank, null and undefined', () => {
    assert.strictEqual(forDisplay(''), 'Someone')
    assert.strictEqual(forDisplay('   '), 'Someone')
    assert.strictEqual(forDisplay(null), 'Someone')
    assert.strictEqual(forDisplay(undefined), 'Someone')
  })

  it('trims surrounding whitespace', () => {
    assert.strictEqual(forDisplay('  Bob  '), 'Bob')
  })

  it('honours a caller-supplied budget', () => {
    assert.strictEqual(forDisplay('abcdefghij', 5).length, 5)
  })

  it('is safe at the hero font size used by the Bond card', () => {
    // 460px card, 44px padding, ~19px per glyph at fontSize 34 -> ~21 chars fit.
    // NAME_MAX must stay under that with headroom for wide glyphs.
    assert.ok(NAME_MAX <= 21, 'NAME_MAX must fit one line on the Bond card')
  })
})
