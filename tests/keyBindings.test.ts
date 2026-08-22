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
  assert.match(readFileSync('src/renderer/styles/global.css', 'utf8'), /\.keybind__revert--idle \{\n\s*visibility: hidden;/)
})
