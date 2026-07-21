'use strict';
// lib/font.js — Shared font-style converter used by commands/tools.js and main.js

const to = (base, baseUpper) => s => s.split('').map(c => {
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90)  return String.fromCodePoint(code - 65 + baseUpper);
  if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + base);
  return c;
}).join('');

// Ordered list — index 0 = Font 1, index 1 = Font 2, …
const FONT_STYLES = [
  { name: 'Bold',           fn: to(0x1D41A, 0x1D400) },  // 1
  { name: 'Italic',         fn: to(0x1D44E, 0x1D434) },  // 2
  { name: 'Script/Cursive', fn: to(0x1D4EA, 0x1D4D0) },  // 3
  { name: 'Fraktur/Gothic', fn: to(0x1D586, 0x1D56C) },  // 4
  { name: 'Double-Struck',  fn: to(0x1D552, 0x1D538) },  // 5
  { name: 'Bold Italic',    fn: to(0x1D482, 0x1D468) },  // 6
  { name: 'Monospace',      fn: to(0x1D68A, 0x1D670) },  // 7
  { name: 'Sans-Serif',     fn: to(0x1D5BA, 0x1D5A0) },  // 8
  { name: 'Sans Bold',      fn: to(0x1D5EE, 0x1D5D4) },  // 9
  { name: 'Sans Italic',    fn: to(0x1D622, 0x1D608) },  // 10
];

/**
 * Apply a font style to text.
 * @param {string} text  - Input text
 * @param {number} styleNum - 1-based style index (0 = plain, returns text unchanged)
 * @returns {string} Converted text
 */
function applyFontStyle(text, styleNum) {
  if (!styleNum || styleNum < 1 || styleNum > FONT_STYLES.length) return text;
  return FONT_STYLES[styleNum - 1].fn(text);
}

module.exports = { FONT_STYLES, applyFontStyle };
