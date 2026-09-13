'use client'

import {useCallback, useEffect, useRef, useState} from 'react'
import {ApiError, api} from './api'

export type Query<T> = {
  data: T | null
  error: ApiError | null
  loading: boolean
  refresh: () => void
  refreshing: boolean
}

/**
 * Fetch with the four states a console actually has: loading, error, empty and
 * data. Refresh is separate from the first load so a polling table does not
 * flash a skeleton every fifteen seconds.
 */
export function useApi<T>(path: string | null, options: {pollMs?: number} = {}): Query<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!path) return
      isRefresh ? setRefreshing(true) : setLoading(true)
      try {
        const result = await api<T>(path)
        if (!mounted.current) return
        setData(result)
        setError(null)
      } catch (e) {
        if (!mounted.current) return
        setError(e instanceof ApiError ? e : new ApiError('unknown', String(e), 0))
      } finally {
        if (mounted.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [path],
  )

  useEffect(() => {
    mounted.current = true
    void load(false)
    return () => {
      mounted.current = false
    }
  }, [load])

  useEffect(() => {
    if (!options.pollMs || !path) return
    const timer = setInterval(() => void load(true), options.pollMs)
    return () => clearInterval(timer)
  }, [load, options.pollMs, path])

  return {data, error, loading, refreshing, refresh: () => void load(true)}
}
