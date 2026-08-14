import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { GameLogLine, GameState, Profile, Settings, TaskProgress } from '../../shared/types'
import { api } from '../lib/api'
import { errorMessage, isSignInError } from '../lib/format'
import type { PublicAccount } from '../../preload'

interface AppValue {
  ready: boolean
  settings: Settings | null
  saveSettings: (patch: Partial<Settings>) => Promise<void>

  accounts: PublicAccount[]
  activeAccount: PublicAccount | null
  refreshAccounts: () => Promise<void>
  signIn: () => Promise<void>
  signingIn: boolean
  authError: string | null

  profiles: Profile[]
  refreshProfiles: () => Promise<void>

  tasks: TaskProgress[]
  dismissTask: (id: string) => void
  /** Takes a caught error as readily as a sentence — it formats either one. */
  notify: (message: unknown, kind?: 'info' | 'error') => void

  /** Live process state, keyed by profile id. */
  gameStates: Record<string, GameState['status']>
  logs: Record<string, GameLogLine[]>
  clearLogs: (profileId: string) => void
}

const AppContext = createContext<AppValue | null>(null)

const MAX_LOG_LINES = 2000

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<PublicAccount[]>([])
  const [activeId, setActiveId] = useState<string | undefined>()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [tasks, setTasks] = useState<TaskProgress[]>([])
  const [gameStates, setGameStates] = useState<Record<string, GameState['status']>>({})
  const [logs, setLogs] = useState<Record<string, GameLogLine[]>>({})
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // Log lines arrive faster than React should re-render, so they are buffered
  // and flushed on an interval.
  const logBuffer = useRef<Record<string, GameLogLine[]>>({})

  const refreshAccounts = useCallback(async () => {
    const result = await api.auth.list()
    setAccounts(result.accounts)
    setActiveId(result.activeId)
  }, [])

  const refreshProfiles = useCallback(async () => {
    setProfiles(await api.profiles.list())
  }, [])

  useEffect(() => {
    void (async () => {
      const [loadedSettings, running] = await Promise.all([
        api.settings.get(),
        api.game.running(),
        refreshAccounts(),
        refreshProfiles()
      ])
      setSettings(loadedSettings)
      setGameStates(Object.fromEntries(running.map((id) => [id, 'running' as const])))
      setReady(true)
    })()
  }, [refreshAccounts, refreshProfiles])

  // Apply theme and accent as soon as settings load or change.
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    root.style.setProperty('--accent', settings.accentColor)
    const theme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.theme
    root.dataset.theme = theme
  }, [settings])

  useEffect(() => {
    const offProgress = api.tasks.onProgress((task) => {
      setTasks((current) => {
        const next = current.filter((item) => item.id !== task.id)
        return [...next, task]
      })
      if (task.state === 'done') {
        setTimeout(() => setTasks((current) => current.filter((item) => item.id !== task.id)), 2400)
      }
    })

    // A pack installing in the background changes the list without the renderer
    // having asked for anything.
    const offProfiles = api.profiles.onChanged(() => void refreshProfiles())

    const offState = api.game.onState((state) => {
      setGameStates((current) => ({ ...current, [state.profileId]: state.status }))
      if (state.status === 'exited' || state.status === 'crashed') {
        void refreshProfiles()
      }
    })

    const offLog = api.game.onLog((line) => {
      const bucket = (logBuffer.current[line.profileId] ??= [])
      bucket.push(line)
    })

    const flush = setInterval(() => {
      const pending = logBuffer.current
      if (Object.keys(pending).length === 0) return
      logBuffer.current = {}
      setLogs((current) => {
        const next = { ...current }
        for (const [profileId, lines] of Object.entries(pending)) {
          next[profileId] = [...(next[profileId] ?? []), ...lines].slice(-MAX_LOG_LINES)
        }
        return next
      })
    }, 250)

    return () => {
      offProgress()
      offProfiles()
      offState()
      offLog()
      clearInterval(flush)
    }
  }, [refreshProfiles])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await api.settings.update(patch))
  }, [])

  const notify = useCallback((message: unknown, kind: 'info' | 'error' = 'info') => {
    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const text = errorMessage(message)
    // A dead session is the one failure the player can act on from the notice
    // itself, so it gets a button instead of an instruction to go and find one.
    const action = isSignInError(message) ? 'signIn' : undefined

    setTasks((current) => [
      ...current,
      {
        id,
        // The heading already carries the message; repeating it as the detail
        // printed every error twice in the same box.
        label: text,
        progress: 1,
        state: kind === 'error' ? 'error' : 'done',
        action
      }
    ])

    // Anything offering a button stays until it is used or dismissed; a notice
    // that vanishes mid-click is worse than no button at all.
    if (action) return
    setTimeout(() => setTasks((current) => current.filter((task) => task.id !== id)), kind === 'error' ? 8000 : 3500)
  }, [])

  const signIn = useCallback(async () => {
    setSigningIn(true)
    setAuthError(null)
    try {
      await api.auth.signIn()
      await refreshAccounts()
    } catch (error) {
      setAuthError(errorMessage(error))
      // The gate shows `authError` inline, but a sign-in started from a notice
      // has nowhere to put it — without this the window would just close and
      // nothing would happen.
      if (accounts.length > 0) notify(error, 'error')
    } finally {
      setSigningIn(false)
    }
  }, [accounts.length, notify, refreshAccounts])

  const dismissTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id))
  }, [])

  const clearLogs = useCallback((profileId: string) => {
    setLogs((current) => ({ ...current, [profileId]: [] }))
  }, [])

  const value = useMemo<AppValue>(
    () => ({
      ready,
      settings,
      saveSettings,
      accounts,
      activeAccount: accounts.find((account) => account.id === activeId) ?? accounts[0] ?? null,
      refreshAccounts,
      signIn,
      signingIn,
      authError,
      profiles,
      refreshProfiles,
      tasks,
      dismissTask,
      notify,
      gameStates,
      logs,
      clearLogs
    }),
    [
      ready,
      settings,
      saveSettings,
      accounts,
      activeId,
      refreshAccounts,
      signIn,
      signingIn,
      authError,
      profiles,
      refreshProfiles,
      tasks,
      dismissTask,
      notify,
      gameStates,
      logs,
      clearLogs
    ]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
