/**
 * Tidying the argument list before it reaches the game.
 *
 * Mojang's argument templates are filled in by substitution, so a value the
 * launcher does not have becomes an empty string rather than a missing option.
 * That is not the same thing to the client: `--xuid ""` is an Xbox identity of
 * "", which it announces at the join handshake and servers refuse — reported as
 * a game that sits on "joining world" and then disconnects, from a launcher that
 * said the launch went fine.
 */

/**
 * Removes `--name ""` pairs, in place, and returns the names that went.
 *
 * Only for options the client has its own default for. An option that means
 * something different when absent must not be listed.
 */
export function dropEmptyOptions(args: string[], names: string[]): string[] {
  const dropped: string[] = []
  for (let index = args.length - 2; index >= 0; index -= 1) {
    if (!names.includes(args[index]) || args[index + 1] !== '') continue
    dropped.push(args[index])
    args.splice(index, 2)
  }
  return dropped.reverse()
}
