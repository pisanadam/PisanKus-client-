import { useApp } from '../state/AppContext'
import { Icon } from './Icon'
import { t } from '../../shared/i18n'

export function TaskTray(): JSX.Element | null {
  const { tasks, dismissTask, signIn, signingIn, openCrashLog } = useApp()
  if (tasks.length === 0) return null

  return (
    <div className="tasks">
      {tasks.slice(-4).map((task) => {
        const indeterminate = task.progress < 0
        return (
          <div key={task.id} className={task.state === 'error' ? 'task toast--error' : 'task'}>
            <div className="task__head">
              {task.state === 'running' && <div className="spinner" />}
              {task.state === 'done' && <Icon name="check" size={15} />}
              {task.state === 'error' && <Icon name="close" size={15} />}
              <span style={{ flex: 1 }}>{task.label}</span>
              <button
                className="btn btn--ghost btn--icon"
                style={{ padding: 2 }}
                onClick={() => dismissTask(task.id)}
                aria-label="Kapat"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            {(task.detail || task.error) && <div className="task__detail">{task.error ?? task.detail}</div>}

            {task.action === 'signIn' && (
              <button
                className="btn btn--primary btn--sm btn--block"
                style={{ marginTop: 4 }}
                disabled={signingIn}
                onClick={async () => {
                  await signIn()
                  dismissTask(task.id)
                }}
              >
                {signingIn ? <div className="spinner" /> : <Icon name="user" size={15} />}
                {t('Tekrar oturum aç')}
              </button>
            )}

            {task.action === 'openCrash' && task.actionProfileId && (
              <button
                className="btn btn--primary btn--sm btn--block"
                style={{ marginTop: 4 }}
                onClick={() => {
                  openCrashLog(task.actionProfileId!)
                  dismissTask(task.id)
                }}
              >
                <Icon name="terminal" size={15} />
                {t('Analizi aç')}
              </button>
            )}

            {task.state === 'running' && (
              <div className={indeterminate ? 'progress progress--indeterminate' : 'progress'}>
                <div
                  className="progress__bar"
                  style={indeterminate ? undefined : { width: `${Math.round(task.progress * 100)}%` }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
