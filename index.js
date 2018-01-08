// Software License Agreement (ISC License)
//
// Copyright (c) 2017, Matthew Voss
//
// Permission to use, copy, modify, and/or distribute this software for
// any purpose with or without fee is hereby granted, provided that the
// above copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

// PARSE POSITIONS   - LSB (0x7F) are reserved for token ascii value.
// OBJ_BFK = in object before first key, ARR_A_V = in array after value, ...
var ARR_BFV = 0x080
var ARR_B_V = 0x100
var ARR_A_V = 0x180
var OBJ_BFK = 0x200
var OBJ_B_K = 0x280
var OBJ_A_K = 0x300
var OBJ_B_V = 0x380
var OBJ_A_V = 0x400

// ascii tokens as well as special codes for number, error, begin and end.
var TOK = {
  // ascii codes - for all but decimal, token is represented by the first ascii byte encountered
  ARR:      91,   // '['
  ARR_END:  93,   // ']'
  DEC:      100,  // 'd'  - a decimal value starting with: -, 0, 1, ..., 9
  FAL:      102,  // 'f'
  NUL:      110,  // 'n'
  STR:      115,  // 's'  - a string value starting with "
  TRU:      116,  // 't'
  OBJ:      123,  // '{'
  OBJ_END:  125,  // '}'

  // CAPITAL asciii is used for special start/end codes

  // start code
  BEG: 66,          // 'B'  (B)eginning of buffer (starting to parse buffer)

  // end-codes
  END: 69,          // 'E'  (End) of buffer (parsed to limit without error)
                    //      if the 'incremental' option is set, then voff != vlim means that there is an unfinished
                    //      value, and koff != klim means that there is an unfinished key.
}

var ECODE = {
  // when there is an error, ecode is set to one of these
  BAD_VALUE: 66,    // 'B'  encountered invalid byte or series of bytes
  TRUNCATED: 84,    // 'T'  key or value was unfinished at end of buffer
  UNEXPECTED: 85,   // 'U'  encountered a recognized token in wrong place/context
}

// create an int-int map from (pos + tok) -- to --> (new pos)
function pos_map () {
  var ret = []
  var max = 0x400 + 0x7F            // max pos + max ascii
  for (var i = 0; i <= max; i++) {
    ret[i] = 0
  }

  // map ( [ctx], [pos0], [ascii] ) => pos1
  var map = function (s0_arr, chars, s1) {
    s0_arr.forEach(function (s0) {
      for (var i = 0; i < chars.length; i++) {
        ret[s0 | chars.charCodeAt(i)] = s1
      }
    })
  }

  var val = 'ntfds' // legal value starts (null, true, false, decimal, string)

  // 0 = no context (comma separated values)
  // (s0 ctxs +       s0 positions + tokens) -> s1
  map([ARR_BFV, ARR_B_V], val, ARR_A_V)
  map([ARR_A_V], ',', ARR_B_V)

  map([ARR_BFV, ARR_B_V, OBJ_B_V], '[',  ARR_BFV)
  map([ARR_BFV, ARR_B_V, OBJ_B_V], '{',  OBJ_BFK)

  map([OBJ_A_V],            ',',  OBJ_B_K)
  map([OBJ_BFK, OBJ_B_K],   's',  OBJ_A_K)      // s = string
  map([OBJ_A_K],            ':',  OBJ_B_V)
  map([OBJ_B_V],            val,  OBJ_A_V)

  // ending of object and array '}' and ']' is handled in the code by checking the stack

  return ret
}

var POS_MAP = pos_map()

function ascii_to_code (s, code, ret) {
  ret = ret || new Uint8Array(0x7F);
  s.split('').forEach(function (c) { ret[c.charCodeAt(0)] = code })
  return ret
}

// convert map of strings to array of arrays (of bytes)
function ascii_to_bytes (strings) {
  return Object.keys(strings).reduce(function (a, c) {
    a[c.charCodeAt(0)] = strings[c].split('').map(function (c) { return c.charCodeAt(0) })
    return a
  }, [])
}

var WHITESPACE = ascii_to_code('\b\f\n\t\r ', 1)
var NON_TOKEN = ascii_to_code('\b\f\n\t\r ,:', 1)     // token values used internally (and not returned)
var DELIM = ascii_to_code('\b\f\n\t\r ,:{}[]', 1)
var DECIMAL_ASCII = ascii_to_code('-0123456789+.eE', 1)
var TOK_BYTES = ascii_to_bytes({ f: 'alse', t: 'rue', n: 'ull' })

// skip as many bytes of src that match bsrc, up to lim.
// return
//     i    the new index after all bytes are matched (past matched bytes)
//    -i    (negative) the index of *after first unmatched byte*
function skip_bytes (src, off, lim, bsrc) {
  var blen = bsrc.length
  if (blen > lim - off) { blen = lim - off }
  var i = 0
  while (bsrc[i] === src[i + off] && i < blen) { i++ }
  return blen === bsrc.length ? i + off : -(i + off)
}

function skip_str (src, off, lim) {
  for (var i = off; i < lim; i++) {
    if (src[i] === 34) {
      if (src[i - 1] === 92) {
        // count number of escapes going backwards (n = escape count +1)
        for (var n = 2; src[i - n] === 92 && i - n >= off; n++) {}          // \ BACKSLASH escape
        if (n % 2 === 1) {
          return i+1  // skip quote
        }
      } else {
        return i+1  // skip quote
      }
    }
  }
  return -i
}

function skip_dec (src, off, lim) {
  while (off < lim && DECIMAL_ASCII[src[off]] === 1) { off++ }
  return (off < lim && DELIM[src[off]] === 1) ? off : -off
}

function init (ps) {
  ps.src = ps.src || err('missing src property', ps)
  ps.lim = ps.lim == null ? ps.src.length : ps.lim
  ps.tok = TOK.BEG                             // token/byte being handled
  ps.koff = ps.koff || ps.off || 0                        // key offset
  ps.klim = ps.klim || ps.koff                            // key limit (exclusive)
  ps.voff = ps.voff || ps.klim
  ps.vlim = ps.vlim || ps.voff
  ps.stack = ps.stack || []                    // ascii codes 91 and 123 for array / object depth
  ps.pos = ps.pos || ARR_BFV                          // container context and relative position encoded as an int
  ps.ecode !== ECODE.TRUNCATED || err('cannot handle truncated value')
  ps.ecode = 0
  ps.vcount = ps.vcount || 0                             // number of complete values parsed
}

function next (ps) {
  ps.koff = ps.klim
  ps.voff = ps.vlim
  var pos1 = ps.pos
  while (ps.vlim < ps.lim) {
    ps.voff = ps.vlim
    ps.tok = ps.src[ps.vlim++]
    switch (ps.tok) {
      case 8: case 9: case 10: case 12: case 13: case 32:
      if (WHITESPACE[ps.src[ps.vlim]] === 1 && ps.vlim < ps.lim) {             // 119 = 'w' whitespace
        while (WHITESPACE[ps.src[++ps.vlim]] === 1 && ps.vlim < ps.lim) {}
      }
      continue

      case 44:                                          // ,    COMMA
      case 58:                                          // :    COLON
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)       { ps.voff = ps.vlim - 1; return handle_unexp(ps) }
        ps.pos = pos1
        continue

      case 34:                                          // "    QUOTE
        ps.tok = 115                                    // s for string
        ps.vlim = skip_str(ps.src, ps.vlim, ps.lim)
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)         return handle_unexp(ps)
        if (pos1 === OBJ_A_K) {
          // key
          ps.koff = ps.voff
          if (ps.vlim > 0)      { ps.pos = pos1; ps.klim = ps.voff = ps.vlim; continue }
          else                  { ps.klim = ps.voff = -ps.vlim; return handle_neg(ps) }
        } else {
          // value
          if (ps.vlim > 0)      { ps.pos = pos1; ps.vcount++; return true }
          else                  return handle_neg(ps)
        }

      case 102:                                         // f    false
      case 110:                                         // n    null
      case 116:                                         // t    true
        ps.vlim = skip_bytes(ps.src, ps.vlim, ps.lim, TOK_BYTES[ps.tok])
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)         return handle_unexp(ps)
        if (ps.vlim > 0)        { ps.pos = pos1; ps.vcount++; return true }
        else                    return handle_neg(ps)

      case 48:case 49:case 50:case 51:case 52:          // 0-4    digits
      case 53:case 54:case 55:case 56:case 57:          // 5-9    digits
      case 45:                                          // '-'    ('+' is not legal here)
        ps.tok = 100                                    // d for decimal
        ps.vlim = skip_dec(ps.src, ps.vlim, ps.lim)
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)         return handle_unexp(ps)
        if (ps.vlim > 0)        { ps.pos = pos1; ps.vcount++; return true }
        else                    return handle_neg(ps)

      case 91:                                          // [    ARRAY START
      case 123:                                         // {    OBJECT START
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)                               return handle_unexp(ps)
        ps.pos = pos1
        ps.stack.push(ps.tok)
        return true

      case 93:                                          // ]    ARRAY END
        if (ps.pos !== ARR_BFV && ps.pos !== ARR_A_V) return handle_unexp(ps)
        ps.stack.pop()
        ps.pos = ps.stack[ps.stack.length - 1] === 123 ? OBJ_A_V : ARR_A_V;
        ps.vcount++; return true

      case 125:                                         // }    OBJECT END
        if (ps.pos !== OBJ_BFK && ps.pos !== OBJ_A_V) return handle_unexp(ps)
        ps.stack.pop()
        ps.pos = ps.stack[ps.stack.length - 1] === 123 ? OBJ_A_V : ARR_A_V
        ps.vcount++; return true

      default:
        --ps.vlim;
        { ps.ecode = ECODE.BAD_VALUE; return ps.tok = TOK.END }
    }
  }

  // reached src limit without error or truncation
  ps.ecode = 0
  if (NON_TOKEN[ps.tok]) {
    ps.voff = ps.vlim
  }
  return ps.tok = TOK.END
}

function handle_neg (ps) {
  ps.vlim = -ps.vlim
  ps.ecode = ps.vlim === ps.lim ? ECODE.TRUNCATED : ECODE.BAD_VALUE
  return ps.tok = TOK.END
}

function handle_unexp (ps) {
  if (ps.vlim < 0) { ps.vlim = -ps.vlim }
  ps.ecode = ECODE.UNEXPECTED; return ps.tok = TOK.END
}

function tokenize (ps, opt, cb) {
  opt = opt || {}
  init(ps)
  if (!cb(ps)) { return ps }
  var cb_continue = true
  while (next(ps) !== TOK.END) {
    if(cb(ps) !== true) {
      // clear key and value
      ps.koff = ps.klim
      ps.voff = ps.vlim
      return ps
    }
  }

  if (ps.ecode === ECODE.BAD_VALUE) {
    err('bad byte: ' + ps.src[ps.vlim], ps)
  }
  if (ps.ecode === ECODE.UNEXPECTED) {
    err('unexpected token', ps)
  }
  ps.tok = TOK.END
  if (!opt.incremental) {
    ps.stack.length === 0 || err('input was incomplete. use option {incremental: true} to enable partial parsing', ps)
    if (ps.ecode === ECODE.TRUNCATED) {
      if (DECIMAL_ASCII[ps.src[ps.voff]]) {
        // finished number outside of object or array context is considered done: '3.23' or '1, 2, 3'
        ps.tok = TOK.DEC
        ps.ecode = 0
        if (!cb(ps)) {
          return ps
        }
        ps.voff = ps.vlim
        ps.tok = TOK.END
        ps.pos = ARR_A_V
      } else {
        err('input was truncated. use option {incremental: true} to enable partial parsing', ps)
      }
    } else {
      ps.pos !== ARR_B_V || err('trailing comma. use option {incremental: true} to enable partial parsing', ps)
    }
  }

  cb(ps)
  return ps
}

function err (msg, ps) {
  var e = new Error(msg)
  e.parse_state = ps
  throw e
}

module.exports = {
  tokenize: tokenize,
  init: init,
  next: next,
  TOK: TOK,
  ECODE: ECODE,
}
