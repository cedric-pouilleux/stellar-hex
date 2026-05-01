import { readFileSync, writeFileSync } from 'node:fs'
import { argv, exit } from 'node:process'

// CP1252 high-byte map: Unicode codepoint that the byte 0x80..0x9F decoded to.
// Other bytes 0x00..0x7F and 0xA0..0xFF are identity-mapped under both CP1252
// and ISO-8859-1, so we only need this small extra table.
const CP1252_HIGH = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
}

/**
 * Reverses a UTF-8 → CP1252 → UTF-8 double-encoding (mojibake) round-trip.
 * Each codepoint of the input string is mapped back to the byte it would
 * have been in CP1252; the resulting byte buffer is then decoded as UTF-8.
 *
 * Codepoints that have no CP1252 byte (e.g. real emoji or characters
 * that survived intact) are passed through as their UTF-8 bytes — so a
 * file that mixes mojibake and clean Unicode reconstructs cleanly.
 */
function fixMojibake(text) {
  const bytes = []
  for (const char of text) {
    const cp = char.codePointAt(0)
    if (cp <= 0xFF) bytes.push(cp)
    else if (CP1252_HIGH[cp] !== undefined) bytes.push(CP1252_HIGH[cp])
    else {
      const utf8 = Buffer.from(char, 'utf8')
      for (const b of utf8) bytes.push(b)
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

const files = argv.slice(2)
if (files.length === 0) {
  console.error('Usage: node fix-mojibake.mjs <file> [...files]')
  exit(1)
}

for (const file of files) {
  const raw   = readFileSync(file, 'utf8')
  const fixed = fixMojibake(raw)
  if (fixed !== raw) {
    writeFileSync(file, fixed, 'utf8')
    console.log(`fixed: ${file}`)
  } else {
    console.log(`clean: ${file}`)
  }
}
