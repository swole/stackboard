// Board builder check (review finding 1, 3 Nov 2026): every value the Intune script writes stays one
// PowerShell string, whatever quotes it holds. PowerShell closes a single-quoted string on ' and on
// the curly quotes U+2018 to U+201B, so a pasted title like Wiki’; Write-Host x; ’ must not end it.
// The script is only parsed with PowerShell's own parser, never run.
//   node tests/builder-check.mjs        (Windows; needs powershell.exe)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = fs.readFileSync(path.join(ROOT, 'site/teams/builder/builder.js'), 'utf8')
const grab = (name) => {
  const m = src.match(new RegExp(`function ${name} \\(\\w+\\) \\{.*\\}\\n`))
  if (!m) throw new Error(`builder.js: ${name} not found`)
  return m[0]
}
// The two one-line helpers, evaluated on their own (the page script needs a DOM).
const psString = new Function(`${grab('str')}${grab('psString')}return psString`)()

const titles = [
  'Wiki’; Write-Host x; ’',
  "It's here",
  'Left ‘ and right ’ quotes',
  'Low ‚ and reversed ‛',
  "Mixed ' ’ '' ‘‘ end",
  '$(Write-Host sub) and `backtick`',
  // Teams pack 2 fields go out as JSON text through the same psString: a brand name and go links.
  JSON.stringify({ name: 'Acme’; Write-Host x; ’ Corp', accent: '#336699' }),
  JSON.stringify({ pto: 'https://hr.example.com/leave?who=‘me’', 'it’s': 'https://help.example.com/' }),
]
const script = titles.map((t, i) => `Set-Text 'v${i}' ${psString(t)}`).join('\r\n') + '\r\n'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-builder-'))
const scriptFile = path.join(dir, 'board.ps1')
const parser = path.join(dir, 'parse.ps1')
fs.writeFileSync(scriptFile, '﻿' + script, 'utf8')
fs.writeFileSync(
  parser,
  [
    'param([string]$Path, [string]$Out)',
    '$text = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)',
    '$tokens = $null; $errors = $null',
    '$ast = [System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errors)',
    '$cmds = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)',
    '$list = @($cmds | ForEach-Object {',
    '  $args2 = @($_.CommandElements | Select-Object -Skip 1 | ForEach-Object {',
    '    if ($_ -is [System.Management.Automation.Language.StringConstantExpressionAst]) { @{ kind = "string"; value = $_.Value } }',
    '    else { @{ kind = $_.GetType().Name; value = $_.Extent.Text } } })',
    '  @{ name = $_.GetCommandName(); args = $args2 } })',
    '$json = @{ errors = @($errors | ForEach-Object { $_.Message }); commands = $list } | ConvertTo-Json -Depth 6 -Compress',
    // Written as UTF-8 to a file: the console code page would turn curly quotes into look-alikes.
    '[IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding $false))',
  ].join('\r\n'),
  'utf8',
)
const result = path.join(dir, 'parsed.json')
execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', parser, '-Path', scriptFile, '-Out', result])
const raw = fs.readFileSync(result, 'utf8')
fs.rmSync(dir, { recursive: true, force: true })
const out = JSON.parse(raw.trim())

let fails = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`)
}
const commands = [].concat(out.commands ?? [])
eq('builder: the Intune lines parse with no errors', [].concat(out.errors ?? []), [])
eq('builder: one Set-Text command per value, nothing else runs', commands.map((c) => c.name), titles.map(() => 'Set-Text'))
titles.forEach((t, i) => {
  const args = [].concat(commands[i]?.args ?? [])
  eq(`builder: value ${i} stays one string, read back exactly`, args.map((a) => [a.kind, a.value]), [['string', `v${i}`], ['string', t]])
})
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
process.exit(fails ? 1 : 0)
