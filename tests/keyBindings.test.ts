import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const optionsEditor = readFileSync('src/renderer/components/OptionsEditor.tsx', 'utf8')

test('a changed key binding can be put back on its own', () => {
  assert.match(optionsEditor, /defaultValue=\{KEY_BIND_DEFAULTS\[spec\.key\]\}/)
  assert.match(optionsEditor, /const changed = defaultValue != null && value !== defaultValue/)
  assert.match(optionsEditor, /onClick=\{\(\) => defaultValue && onChange\(defaultValue\)\}/)
})

test('the revert button keeps its place so the unbind column stays straight', () => {
  assert.match(optionsEditor, /keybind__revert--idle/)
  assert.match(optionsEditor, /disabled=\{!changed\}/)
  // No literal newline in the pattern: Windows checkouts carry CRLF, and a
  // test that only passes on one line ending is a test that fails on a machine
  // rather than on a mistake.
  assert.match(
    readFileSync('src/renderer/styles/global.css', 'utf8'),
    /\.keybind__revert--idle\s*\{\s*visibility:\s*hidden;/
  )
})
