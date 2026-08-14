import type { Profile } from '../../shared/types'

/**
 * A profile's icon: the picture the player chose, or the emoji as a fallback.
 *
 * One component for every place a profile appears, so a picture set in the
 * profile's settings shows up in the sidebar and the library without each of
 * them having to know the rule.
 */
export function ProfileIcon({
  profile,
  size = 22
}: {
  profile: Pick<Profile, 'icon' | 'iconImage' | 'name'>
  size?: number
}): JSX.Element {
  return (
    <span
      className="profile-icon"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.72) }}
      aria-hidden="true"
    >
      {profile.iconImage ? (
        <img className="profile-icon__image" src={profile.iconImage} alt="" />
      ) : (
        (profile.icon ?? '🎮')
      )}
    </span>
  )
}
