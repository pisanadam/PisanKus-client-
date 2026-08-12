import { useApp } from '../state/AppContext'
import { Icon } from './Icon'

export function TaskTray(): JSX.Element | null {
  const { tasks, dismissTask } = useApp()
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
