import { afterEach, describe, expect, it } from 'vitest'
import { setUiLocale } from '../src/client/locale.ts'
import { isStoppableJob, jobElapsedMs, jobKillNotice, killHostJob } from '../src/client/job-control.ts'

afterEach(() => { setUiLocale('zh') })

describe('background job control', () => {
  it('computes live elapsed time and only stoppable jobs can be killed', () => {
    expect(jobElapsedMs({ startedAt: 1_000, finishedAt: 1_400 }, 9_000)).toBe(400)
    expect(jobElapsedMs({ startedAt: 1_000 }, 1_250)).toBe(250)
    expect(isStoppableJob('running')).toBe(true)
    expect(isStoppableJob('stopping')).toBe(true)
    expect(isStoppableJob('completed')).toBe(false)
  })

  it('kills through the Host registry without importing dsh-jobs', () => {
    const calls: string[] = []
    expect(killHostJob({
      kill(id) {
        calls.push(id)
        return 'requested'
      },
    }, 'bash-1')).toBe('requested')
    expect(calls).toEqual(['bash-1'])
    expect(() => killHostJob(undefined, 'bash-1')).toThrow('Harness 后台任务服务未装配')
    expect(jobKillNotice('requested')).toBe('已请求停止任务')
    expect(jobKillNotice('already-finished')).toBe('任务已经结束')
  })
})
