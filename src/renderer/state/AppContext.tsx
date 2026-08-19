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
import '../../shared/i18n/tables'
import { detectLanguage, isRtl, setLanguage } from '../../shared/i18n'
import { api } from '../lib/api'
import { errorMessage, isSignInError } from '../lib/format'
import type { PublicAccount } from '../../preload'

/**
 * Lettering that stays readable on top of the chosen accent.
 *
 * The accent is a player setting and the palette runs from pale turquoise to
 * deep violet, so no single fixed colour works on all of it — white vanishes on
 * the light half, black on the dark half. Light accents get very dark lettering
 * tinted with the accent itself (which is what keeps the brand mark looking
 * deliberate rather than stamped with plain black); dark accents keep white.
 */
function onAccent(accent: string): string {
  const hex = accent.trim().replace('#', '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
  const channels = [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16))
  if (full.length !== 6 || channels.some((value) => Number.isNaN(value))) return '#04302f'

  // WCAG relative luminance, which is what decides readability here.
  const linear = channels.map((value) => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  if (luminance < 0.3) return '#ffffff'
  return `#${channels.map((value) => Math.round(value * 0.18).toString(16).padStart(2, '0')).join('')}`
}

interface AppValue {
  ready: boolean
  startupError: string | null
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
  const [startupError, setStartupError] = useState<string | null>(null)
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
      try {
        const [loadedSettings, running] = await Promise.all([
          api.settings.get(),
          api.game.running(),
          refreshAccounts(),
          refreshProfiles()
        ])
        setSettings(loadedSettings)
        setGameStates(Object.fromEntries(running.map((id) => [id, 'running' as const])))
      } catch (error) {
        setStartupError(errorMessage(error))
      } finally {
        setReady(true)
      }
    })()
  }, [refreshAccounts, refreshProfiles])

  /**
   * The language in force, resolved from the setting.
   *
   * It is applied during render rather than in an effect: `t()` is read while
   * the tree is being built, so the table has to be in place before the first
   * line is drawn — an effect would leave one frame in the old language.
   */
  const language = settings
    ? settings.language === 'system'
      ? detectLanguage(navigator.language)
      : settings.language
    : 'tr'
  setLanguage(language)

  // Apply theme, accent and writing direction as soon as settings load or change.
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    root.lang = language
    root.dir = isRtl(language) ? 'rtl' : 'ltr'
    root.style.setProperty('--accent', settings.accentColor)
    root.style.setProperty('--on-accent', onAccent(settings.accentColor))
    const theme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.theme
    root.dataset.theme = theme
  }, [settings, language])

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
      startupError,
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
      startupError,
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
