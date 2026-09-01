import assert from 'node:assert/strict'
import test from 'node:test'
import { profileArgument, profileIdFromArgv } from '../src/main/cliArgs.ts'

const ID = '3f2b9c14-7d5e-4a81-9f60-2c8ab1e40d77'

test('both spellings of the argument are read', () => {
  assert.equal(profileIdFromArgv(['launcher.exe', `--profile=${ID}`]), ID)
  assert.equal(profileIdFromArgv(['launcher.exe', '--profile', ID]), ID)
})

test('no argument means no profile', () => {
  assert.equal(profileIdFromArgv([]), null)
  assert.equal(profileIdFromArgv(['launcher.exe']), null)
  assert.equal(profileIdFromArgv(['launcher.exe', '--other=x']), null)
})

/**
 * The argument arrives from a `.lnk` or a `.desktop` file that anyone can edit.
 * A launcher that opened whatever a text file told it to would be a launcher
 * that could be pointed anywhere.
 */
test('anything that is not one of our own ids is refused', () => {
  for (const value of [
    '../../etc/passwd',
    'not-a-uuid',
    '',
    `${ID} extra`,
    `${ID}x`,
    '3f2b9c14-7d5e-4a81-9f60-2c8ab1e40d7',
    'javascript:alert(1)'
  ]) {
    assert.equal(profileIdFromArgv(['launcher.exe', `--profile=${value}`]), null, value)
    assert.equal(profileIdFromArgv(['launcher.exe', '--profile', value]), null, value)
  }
})

test('a dangling flag with nothing after it is refused', () => {
  assert.equal(profileIdFromArgv(['launcher.exe', '--profile']), null)
})

test('what a shortcut is written with is what is read back', () => {
  const argument = profileArgument(ID)
  assert.equal(argument, `--profile=${ID}`)
  assert.equal(profileIdFromArgv(['launcher.exe', argument]), ID)
})

test('the argument is found wherever it sits on the line', () => {
  assert.equal(profileIdFromArgv(['launcher.exe', '--no-sandbox', `--profile=${ID}`, '--other']), ID)
})
