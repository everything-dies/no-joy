export interface StaleGuard {
  wrap: <T>(promise: Promise<T>) => Promise<T>
  invalidate: () => void
}

export function createStaleGuard(): StaleGuard {
  let valid = true

  const neverSettle = new Promise<never>(() => {
    // Intentionally never resolves or rejects.
    // When a guard is invalidated, wrapped promises race against
    // this and effectively become dormant.
  })

  return {
    wrap<T>(promise: Promise<T>): Promise<T> {
      return promise.then(
        (value) => (valid ? value : neverSettle),
        (reason) => {
          if (valid) throw reason
          return neverSettle
        }
      )
    },
    invalidate() {
      valid = false
    },
  }
}
