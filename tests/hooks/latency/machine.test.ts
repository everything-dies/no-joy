import { createActor } from 'xstate'
import { describe, expect, it } from 'vitest'

import { latencyMachine } from '../../../src/hooks/latency/machine'

function createTestActor() {
  const actor = createActor(latencyMachine)
  actor.start()
  return actor
}

describe('latencyMachine', () => {
  it('starts in idle state', () => {
    const actor = createTestActor()
    expect(actor.getSnapshot().value).toBe('idle')
    actor.stop()
  })

  it('transitions from idle to pending on WATCH', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    expect(actor.getSnapshot().value).toBe('pending')
    actor.stop()
  })

  it('transitions from pending to fulfilled on RESOLVE with data', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'RESOLVE', data: 'hello' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('fulfilled')
    expect(snapshot.context.data).toBe('hello')
    expect(snapshot.context.error).toBeUndefined()
    actor.stop()
  })

  it('transitions from pending to rejected on REJECT with error', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'REJECT', error: 'fail' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('rejected')
    expect(snapshot.context.error).toBe('fail')
    expect(snapshot.context.data).toBeUndefined()
    actor.stop()
  })

  it('transitions from pending to idle on ABORT with cleared context', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'ABORT' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('idle')
    expect(snapshot.context.data).toBeUndefined()
    expect(snapshot.context.error).toBeUndefined()
    actor.stop()
  })

  it('re-enters pending on WATCH from pending', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })

    const snap1 = actor.getSnapshot()
    expect(snap1.value).toBe('pending')

    // Send WATCH again — should re-enter pending
    actor.send({ type: 'WATCH' })

    const snap2 = actor.getSnapshot()
    expect(snap2.value).toBe('pending')
    actor.stop()
  })

  it('transitions from fulfilled to pending on WATCH', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'RESOLVE', data: 'done' })
    expect(actor.getSnapshot().value).toBe('fulfilled')

    actor.send({ type: 'WATCH' })
    expect(actor.getSnapshot().value).toBe('pending')
    actor.stop()
  })

  it('transitions from rejected to pending on WATCH', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'REJECT', error: 'fail' })
    expect(actor.getSnapshot().value).toBe('rejected')

    actor.send({ type: 'WATCH' })
    expect(actor.getSnapshot().value).toBe('pending')
    actor.stop()
  })

  it('transitions from fulfilled to idle on RESET with cleared context', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'RESOLVE', data: 'done' })

    actor.send({ type: 'RESET' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('idle')
    expect(snapshot.context.data).toBeUndefined()
    expect(snapshot.context.error).toBeUndefined()
    actor.stop()
  })

  it('transitions from rejected to idle on RESET with cleared context', () => {
    const actor = createTestActor()
    actor.send({ type: 'WATCH' })
    actor.send({ type: 'REJECT', error: 'fail' })

    actor.send({ type: 'RESET' })

    const snapshot = actor.getSnapshot()
    expect(snapshot.value).toBe('idle')
    expect(snapshot.context.data).toBeUndefined()
    expect(snapshot.context.error).toBeUndefined()
    actor.stop()
  })

  it('ignores invalid transitions', () => {
    const actor = createTestActor()

    // RESOLVE from idle should be ignored
    actor.send({ type: 'RESOLVE', data: 'nope' })
    expect(actor.getSnapshot().value).toBe('idle')

    // ABORT from idle should be ignored
    actor.send({ type: 'ABORT' })
    expect(actor.getSnapshot().value).toBe('idle')

    // RESET from idle should be ignored
    actor.send({ type: 'RESET' })
    expect(actor.getSnapshot().value).toBe('idle')

    actor.stop()
  })
})
