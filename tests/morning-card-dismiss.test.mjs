// James, 25 Oct 2026: "Give me a way to dismiss the morning pop-up" — a missed routine must not sit pinned on Ready
// all evening. The Morning card carries a × that hides it until Morning's day rolls over, without ticking any step.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const src = readFileSync(new URL('../web/core/chats.js', import.meta.url), 'utf8')

// James, 25 Oct 2026: "when I hit it, it should automatically return me to the previous screen ... on any build when
// I'm dismissing something, archiving something". Apps get one shared call for that; the Chats card remembers its source.
test('apps can return to the previous screen after a finishing action, through the shell Back', () => {
  const client = readFileSync(new URL('../web/core/app-client.js', import.meta.url), 'utf8')
  const svc = readFileSync(new URL('../web/core/app-services.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8')
  assert.match(client, /back: \(\) => \{ try \{ return service\?\.nav\?\.back\?\.\(\) === true/)
  assert.match(svc, /back\(\) \{ check\(\); if \(st\.isVisible\?\.\(\) !== true/, 'hidden apps cannot navigate the owner')
  assert.match(svc, /isVisible, (?:isFront, )?back, readingStorage \}/)
  assert.match(app, /back: \(\) => \{ if \(desks\[idx\]\.focus !== w\.id\) return false; const did = backStep\(w\.id\)/)
  assert.match(src, /H\.openApp\?\.\(appOpen\.dataset\.chappopen, e\.target\)/, 'app cards preserve their Chats source')
})
