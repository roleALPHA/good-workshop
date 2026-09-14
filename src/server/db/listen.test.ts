import { afterEach, describe, expect, it } from 'vitest'
import { listen } from './index'

/**
 * A listener must not take its process down when the database is not there.
 *
 * The collaboration process starts listening the moment it starts, and a
 * container comes up before Postgres does -- or, in the image smoke test,
 * without one at all. The pool is lazy for exactly that reason (see client.ts);
 * a listener that throws from inside a fire-and-forget promise is an unhandled
 * rejection, and Node ends the process on one.
 */
describe('listen', () => {
  const saved = process.env.DATABASE_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = saved
  })

  it('keeps retrying instead of throwing when there is no database to reach', async () => {
    delete process.env.DATABASE_URL
    const rejections: unknown[] = []
    const onRejection = (reason: unknown) => rejections.push(reason)
    process.on('unhandledRejection', onRejection)

    const listener = listen(
      'gw_test',
      () => {},
      () => {},
    )
    try {
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(rejections).toEqual([])
    } finally {
      await listener.close()
      process.off('unhandledRejection', onRejection)
    }
  })
})
