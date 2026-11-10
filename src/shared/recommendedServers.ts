/**
 * The servers the launcher suggests.
 *
 * A suggestion and nothing more. The list is shown on a profile's server tab
 * and an address reaches `servers.dat` only when the player presses add —
 * nothing here is written on a launch. The list that *is* applied automatically
 * is the player's own `minecraftServers` setting, which starts empty and stays
 * theirs.
 *
 * An entry drops off the card as soon as the profile holds its address, so a
 * server the player added by hand is not offered twice and one they removed on
 * purpose is not pushed back at them.
 */

export interface RecommendedServer {
  /** Written into the list as the name; the player can rename it afterwards. */
  name: string
  address: string
}

export const RECOMMENDED_SERVERS: RecommendedServer[] = [
  { name: 'PisanKus SF League', address: 'pisan-sf-league.exaroton.me' },
  { name: 'PisanKus PvP', address: 'pisanpvp.exaroton.me' }
]

/**
 * Address comparison as the `servers.dat` seeding does it: case and surrounding
 * space ignored, because `Play.Example.NET ` and `play.example.net` are the same
 * server to everyone except a string comparison.
 */
export function sameServerAddress(one: string, other: string): boolean {
  return one.trim().toLowerCase() === other.trim().toLowerCase()
}

/** The suggestions a profile's list does not already contain. */
export function missingRecommendedServers(
  present: { address: string }[]
): RecommendedServer[] {
  return RECOMMENDED_SERVERS.filter(
    (candidate) => !present.some((entry) => sameServerAddress(entry.address, candidate.address))
  )
}
