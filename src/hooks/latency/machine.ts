import { assign, setup } from 'xstate'

import { type LatencyContext, type LatencyEvent } from './types'

export const latencyMachine = setup({
  types: {
    context: {} as LatencyContext,
    events: {} as LatencyEvent,
  },
  actions: {
    assignData: assign({
      data: ({ event }) => {
        if (event.type !== 'RESOLVE') return undefined
        return event.data
      },
      error: () => undefined,
    }),
    assignError: assign({
      data: () => undefined,
      error: ({ event }) => {
        if (event.type !== 'REJECT') return undefined
        return event.error
      },
    }),
    clearContext: assign({
      data: () => undefined,
      error: () => undefined,
    }),
  },
}).createMachine({
  id: 'latency',
  initial: 'idle',
  context: {
    data: undefined,
    error: undefined,
  },
  states: {
    idle: {
      on: {
        WATCH: { target: 'pending' },
      },
    },
    pending: {
      on: {
        RESOLVE: {
          target: 'fulfilled',
          actions: 'assignData',
        },
        REJECT: {
          target: 'rejected',
          actions: 'assignError',
        },
        ABORT: {
          target: 'idle',
          actions: 'clearContext',
        },
        WATCH: {
          target: 'pending',
          reenter: true,
        },
      },
    },
    fulfilled: {
      on: {
        WATCH: {
          target: 'pending',
        },
        RESET: {
          target: 'idle',
          actions: 'clearContext',
        },
      },
    },
    rejected: {
      on: {
        WATCH: {
          target: 'pending',
        },
        RESET: {
          target: 'idle',
          actions: 'clearContext',
        },
      },
    },
  },
})
