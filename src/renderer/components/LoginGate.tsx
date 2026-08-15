import { useApp } from '../state/AppContext'

/**
 * Microsoft sign-in is mandatory: nothing else in the launcher renders until an
 * account with a valid Minecraft entitlement is connected.
 */
export function LoginGate(): JSX.Element {
  const { signIn, signingIn, authError } = useApp()

  return (
    <div className="gate">
      <div className="gate__panel">
        <div className="gate__mark">PK</div>

        <div>
          <h1 className="gate__title">PisanKus Client</h1>
          <p className="gate__text">
            Devam etmek için Minecraft: Java Edition sahibi olduğunuz Microsoft hesabıyla oturum açın.
          </p>
        </div>

        {authError && <div className="gate__error">{authError}</div>}

        <button className="btn btn--microsoft" onClick={() => void signIn()} disabled={signingIn}>
          {signingIn ? (
            <>
              <div className="spinner" />
              Oturum açılıyor…
            </>
          ) : (
            <>
              <span className="ms-logo" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              Microsoft ile oturum aç
            </>
          )}
        </button>

        <p className="faint">
          Oturum bilgileriniz yalnızca cihazınızda saklanır. PisanKus Client hiçbir veriyi kendi sunucularına
          göndermez.
        </p>
      </div>
    </div>
  )
}
