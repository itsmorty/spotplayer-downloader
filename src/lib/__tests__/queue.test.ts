import { afterEach, describe, expect, it, vi } from 'vitest'
import { runQueue } from '../queue'
import type { QueueItem } from '../queue'
import type { Video } from '../types'

function video(id: string): Video {
  return { id, name: `Lesson ${id}`, size: 1000, cdn: 1, time: 60 }
}

function item(id: string): QueueItem {
  return { video: video(id), status: 'pending' }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const blobOf = (text: string): Blob => new Blob([text], { type: 'video/mp4' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runQueue', () => {
  it('runs items strictly one at a time and in order', async () => {
    const items = [item('a'), item('b'), item('c')]
    const gates: Deferred<Blob>[] = []
    const calls: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const run = vi.fn(async (current: QueueItem) => {
      calls.push(current.video.id)
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      const gate = deferred<Blob>()
      gates.push(gate)
      try {
        return await gate.promise
      } finally {
        inFlight--
      }
    })
    const updates: string[] = []
    const saved: string[] = []

    const done = runQueue(items, run, {
      onItemUpdate: (current) => updates.push(`${current.video.id}:${current.status}`),
      onItemDone: (current, blob) => saved.push(`${current.video.id}:${blob.size}`),
    })

    // Only the first item starts; nothing else is in flight.
    expect(calls).toEqual(['a'])
    expect(items[0].status).toBe('running')
    expect(items[1].status).toBe('pending')

    gates[0].resolve(blobOf('one'))
    await tick()
    expect(calls).toEqual(['a', 'b'])
    expect(items[0].status).toBe('done')
    expect(items[1].status).toBe('running')

    gates[1].resolve(blobOf('two'))
    await tick()
    expect(calls).toEqual(['a', 'b', 'c'])
    expect(items[1].status).toBe('done')
    expect(items[2].status).toBe('running')

    gates[2].resolve(blobOf('three'))
    await done

    expect(maxInFlight).toBe(1)
    expect(items.map((i) => i.status)).toEqual(['done', 'done', 'done'])
    expect(updates).toEqual([
      'a:running', 'a:done',
      'b:running', 'b:done',
      'c:running', 'c:done',
    ])
    expect(saved).toEqual(['a:3', 'b:3', 'c:5'])
  })

  it('continues after a failure and records the error message', async () => {
    const items = [item('a'), item('b'), item('c')]
    const run = vi.fn(async (current: QueueItem) => {
      if (current.video.id === 'b') throw new Error('segment 3: HTTP 500')
      return blobOf(current.video.id)
    })
    const saved: string[] = []
    const updates: string[] = []

    await runQueue(items, run, {
      onItemUpdate: (current) => updates.push(`${current.video.id}:${current.status}`),
      onItemDone: (current) => saved.push(current.video.id),
    })

    expect(run).toHaveBeenCalledTimes(3)
    expect(items[0]).toMatchObject({ status: 'done' })
    expect(items[1]).toMatchObject({ status: 'error', error: 'segment 3: HTTP 500' })
    expect(items[2]).toMatchObject({ status: 'done' })
    expect(saved).toEqual(['a', 'c'])
    expect(updates).toContain('b:error')
  })

  it('uses a plain string for a non-Error rejection', async () => {
    const items = [item('a')]
    await runQueue(items, async () => Promise.reject('nope'), {
      onItemUpdate: () => {},
      onItemDone: () => {},
    })
    expect(items[0]).toMatchObject({ status: 'error', error: 'nope' })
  })

  it('stops after an abort in the middle of the run', async () => {
    const items = [item('a'), item('b'), item('c')]
    const controller = new AbortController()
    const gate = deferred<Blob>()
    const run = vi.fn(async () => gate.promise)
    const saved: string[] = []

    const done = runQueue(
      items,
      run,
      { onItemUpdate: () => {}, onItemDone: (current) => saved.push(current.video.id) },
      controller.signal,
    )

    expect(items[0].status).toBe('running')
    controller.abort()
    gate.reject(new DOMException('the operation was aborted', 'AbortError'))
    await done

    expect(run).toHaveBeenCalledTimes(1)
    expect(items[0]).toMatchObject({ status: 'error', error: 'aborted' })
    expect(items[1].status).toBe('pending')
    expect(items[2].status).toBe('pending')
    expect(saved).toEqual([])
  })

  it('stops before the next item when aborted between items', async () => {
    const items = [item('a'), item('b')]
    const controller = new AbortController()
    const run = vi.fn(async (current: QueueItem) => blobOf(current.video.id))

    await runQueue(
      items,
      run,
      {
        onItemUpdate: () => {},
        onItemDone: (current) => {
          if (current.video.id === 'a') controller.abort()
        },
      },
      controller.signal,
    )

    expect(run).toHaveBeenCalledTimes(1)
    expect(items[0].status).toBe('done')
    expect(items[1].status).toBe('pending')
  })

  it('does nothing when the signal is already aborted', async () => {
    const items = [item('a'), item('b')]
    const controller = new AbortController()
    controller.abort()
    const run = vi.fn(async () => blobOf('x'))
    const updated = vi.fn()

    await runQueue(items, run, { onItemUpdate: updated, onItemDone: () => {} }, controller.signal)

    expect(run).not.toHaveBeenCalled()
    expect(updated).not.toHaveBeenCalled()
    expect(items.map((i) => i.status)).toEqual(['pending', 'pending'])
  })
})
