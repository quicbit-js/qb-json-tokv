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

  // when there is an error, these tokens are returned parse-state (never as callback arguments)
  UNEXPECTED: 85,   // 'U'  if encountered token in wrong place/context
  BAD_BYT: 88,      // 'X'  encountered invalid byte.  if voff != vlim, then the byte is considered part of a value
}

// convert internal position code into public ascii code (with accurate position state instead of obj/arr context)
// F - before first value or first key-value
// J - before key, K - within key, L - after key
// U - before val, V - within val, W - after val
function pcode2pos (pcode, trunc) {
  if (trunc) {
    return (pcode === OBJ_BFK || pcode === OBJ_B_K) ? 'K' : 'V'
  }
  switch (pcode) {
    case ARR_BFV: case OBJ_BFK: return 'F'
    case ARR_B_V: case OBJ_B_V: return 'U'
    case ARR_A_V: case OBJ_A_V: return 'W'
    case OBJ_B_K: return 'J'
    case OBJ_A_K: return 'L'
  }
}

// convert public position ascii back to internal position code
function pos2pcode (pos, in_obj) {
  if (in_obj) {
    switch (pos) {
      case 'F': return OBJ_BFK
      case 'J': return OBJ_B_K
      case 'W': return OBJ_A_V
      default: err('cannot restore object position "' + pos + '"')
    }
  } else {
    switch (pos) {
      case 'F': return ARR_BFV
      case 'U': return ARR_B_V
      case 'W': return ARR_A_V
      default: err('cannot restore array position "' + pos + '"')
    }
  }
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

  var val = '"ntf-0123456789' // all legal value starts (ascii)

  // 0 = no context (comma separated values)
  // (s0 ctxs +       s0 positions + tokens) -> s1
  map([ARR_BFV, ARR_B_V], val, ARR_A_V)
  map([ARR_A_V], ',', ARR_B_V)

  map([ARR_BFV, ARR_B_V, OBJ_B_V], '[',  ARR_BFV)
  map([ARR_BFV, ARR_B_V, OBJ_B_V], '{',  OBJ_BFK)

  map([OBJ_A_V],            ',',  OBJ_B_K)
  map([OBJ_BFK, OBJ_B_K],     '"',  OBJ_A_K)
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
var DELIM = ascii_to_code('\b\f\n\t\r ,:{}[]', 1)
var DECIMAL_ASCII = ascii_to_code('-0123456789+.eE', 1)
var TOK_BYTES = ascii_to_bytes({ f: 'false', t: 'true', n: 'null' })
var VAL_TOKENS = ascii_to_code('sdtfn{}[]!XU', 1, [])       // tokens that use a value range (vlim > voff), including truncated values

// skip as many bytes of src that match bsrc, up to lim.
// return
//     i    the new index after all bytes are matched (past matched bytes)
//    -i    (negative) the index of after first unmatched byte
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
  return -1
}

function tokenize (ps, opt, cb) {
  opt = opt || {}

  var src =     ps.src || err('missing src property', ps)
  var lim =     ps.lim == null ? ps.src.length : ps.lim
  var tok =     ps.tok || 0                                         // token/byte being handled
  var koff =    ps.koff || ps.off || 0                              // key offset
  var klim =    ps.klim || koff                                     // key limit (exclusive)
  var voff =    ps.voff || klim                                     // value start index
  var idx =     ps.vlim || voff                                     // current source offset

  var stack =   ps.stack || []  // ascii codes 91 and 123 for array / object depth
  var in_obj =  stack[stack.length - 1] === 123
  var pos0 =    ps.pos && pos2pcode(ps.pos, in_obj) || ARR_BFV      // container context and relative position encoded as an int
  var vcount =  ps.vcount || 0                                      // number of complete values parsed
  var pos1 = pos0   // pos1 possibilities are:
                        //    pos1 == 0;                   unsupported transition
                        //    pos1 > 0, pos1 == pos0;      transition OK, token has been handled
                        //    pos1 > 0, pos1 != pos0;      transition OK, token not yet handled

  // localized constants for faster access
  var pmap = POS_MAP
  var obj_bfk = OBJ_BFK
  var obj_a_k = OBJ_A_K
  var obj_a_v = OBJ_A_V
  var arr_bfv = ARR_BFV
  var arr_a_v = ARR_A_V
  var tok_bytes = TOK_BYTES
  var decimal_ascii = DECIMAL_ASCII
  var whitespace = WHITESPACE
  var delim = DELIM
  var trunc = false   // true for truncated (incomplete) key or value
  var pcontext = 0

  var cb_continue = cb(src, 0, 0, TOK.BEG, idx, idx)                      // 'B' - BEGIN parse
  if (cb_continue) {
    // breaking main_loop before vlim == lim means callback returned falsey or we have an error
    main_loop: while (idx < lim) {
      tok = src[idx]
      switch (tok) {
        case 8: case 9: case 10: case 12: case 13: case 32:
          if (whitespace[src[++idx]] === 1 && idx < lim) {             // 119 = 'w' whitespace
            while (whitespace[src[++idx]] === 1 && idx < lim) {}
          }
          continue

        // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

        case 44:                                          // ,    COMMA
        case 58:                                          // :    COLON
          pos1 = pmap[pos0 | tok]
          idx++
          if (pos1 === 0) { voff = idx-1; tok = TOK.UNEXPECTED; break main_loop }
          pos0 = pos1
          continue

        case 102:                                         // f    false
        case 110:                                         // n    null
        case 116:                                         // t    true
          voff = idx
          idx = skip_bytes(src, idx, lim, tok_bytes[tok])
          pos1 = pmap[pos0 | tok]
          if (pos1 === 0) { idx = idx < 0 ? -idx : idx; tok = TOK.UNEXPECTED; break main_loop }
          if (idx <= 0) {
            idx = -idx
            if (idx === lim) { trunc = true; break main_loop }
            else { trunc = true; tok = TOK.BAD_BYT; break main_loop }  // include unexpected byte in value
          }
          vcount++
          break

        case 34:                                          // "    QUOTE
          voff = idx
          pos1 = pmap[pos0 | tok]
          tok = 115                                       // s for string
          idx = skip_str(src, idx + 1, lim)
          if (pos1 === 0) { idx = idx === -1 ? lim : idx; tok = TOK.UNEXPECTED; break main_loop }
          else if (idx === -1) { idx = lim; trunc = true; break main_loop }

          // key
          if (pos1 === obj_a_k) {
            koff = voff
            klim = idx
            pos0 = pos1
            continue
          }
          vcount++
          break

        case 48:case 49:case 50:case 51:case 52:          // 0-4    digits
        case 53:case 54:case 55:case 56:case 57:          // 5-9    digits
        case 45:                                          // '-'    ('+' is not legal here)
          voff = idx
          pos1 = pmap[pos0 | tok]
          tok = 100                                       // d   for decimal
          while (decimal_ascii[src[++idx]] === 1 && idx < lim) {}     // d (100) here means decimal-type ascii

          // for UNEXP_BYTE, the byte is included with the number to indicate it was encountered while parsing number.
          if (pos1 === 0)                       { tok = TOK.UNEXPECTED;  break main_loop }
          else if (idx === lim)                 { trunc = true; break main_loop }                    // *might* be truncated - handle below
          else if (delim[src[idx]] === 0)       { trunc = true; tok = TOK.BAD_BYT; break main_loop } // treat non-separating chars as bad byte
          vcount++
          break

        case 91:                                          // [    ARRAY START
        case 123:                                         // {    OBJECT START
          voff = idx
          in_obj = tok === 123
          pos1 = pmap[pos0 | tok]
          idx++
          if (pos1 === 0) { tok = TOK.UNEXPECTED; break main_loop }
          stack.push(tok)
          break

        case 93:                                          // ]    ARRAY END
          voff = idx
          in_obj = stack[stack.length - 2] === 123        // set before breaking loop
          idx++
          if (pos0 !== arr_bfv && pos0 !== arr_a_v) { tok = TOK.UNEXPECTED; break main_loop }
          pcontext = stack.pop()
          pos1 = in_obj ? obj_a_v : arr_a_v
          vcount++
          break

        case 125:                                         // }    OBJECT END
          voff = idx
          in_obj = stack[stack.length - 2] === 123        // set before breaking loop
          idx++
          if (pos0 !== obj_bfk && pos0 !== obj_a_v) { tok = TOK.UNEXPECTED; break main_loop }
          pcontext = stack.pop()
          pos1 = in_obj ? obj_a_v : arr_a_v
          vcount++
          break

        default:
          voff = idx
          tok = TOK.BAD_BYT                               // no value token starts with this byte
          break main_loop
      }
      // clean transition was made from pos0 to pos1
      cb_continue = cb(src, koff, klim, tok, voff, idx, null)
      koff = klim
      voff = idx
      pos0 = pos1
      if (cb_continue !== true && !cb_continue) {    // (checking !== true is slightly faster in node 6)
        break
      }
    }  // end main_loop: while(vlim < lim) {...
  }

  var pcode = pcode2pos(pos0, trunc)
  var is_err = tok === TOK.BAD_BYT || tok === TOK.UNEXPECTED

  if (idx !== voff) {
    if (!VAL_TOKENS[tok]) {
      // wipe out value ranges cased by whitespace, colon, comma etc.
      voff = idx
    } else {
      if (in_obj) {
        // finish moving value to key range
        if (koff === klim) {
          koff = voff
          klim = voff = idx
        } else  if (klim === idx) {
          voff =idx
        }
      }
    }
  }

  // capture parse state
  ps = {
    src: src,
    koff: koff,
    klim: klim,
    tok: is_err ? tok : TOK.END,
    voff: voff,
    vlim: idx,
    vcount: vcount,
    stack: stack,
    pos: pcode,
  }

  if (!cb_continue) {
    return ps
  }

  if (!opt.incremental && ps.pos === 'V') {
      if (DECIMAL_ASCII[ps.src[ps.voff]] && ps.stack.length === 0 && ps.vlim === lim) {
        // finished number outside of object or array context is considered done: '3.23' or '1, 2, 3'
        cb(ps.src, ps.koff, ps.klim, TOK.DEC, ps.voff, ps.vlim, null)

        ps.pos = 'W'        // after value
        ps.voff = ps.vlim
      } else {
        err('parsing ended on truncated value.  use option {incremental: true} to enable partial parsing', ps)
      }
  }

  if (ps.tok === TOK.BAD_BYT) {
    err('bad byte: ' + ps.src[ps.vlim], ps)
  } else if (tok === TOK.UNEXPECTED) {
    err('unexpected token', ps)
  } else if (!opt.incremental && !parse_complete(ps)) {
    err('input was incomplete. use option {incremental: true} to enable partial parsing', ps)

  }   // else reached limit with some other valid token

  cb(ps.src, ps.koff, ps.klim, ps.tok, ps.voff, ps.vlim, ps)
  return ps
}

function err (msg, ps) {
  var e = new Error(msg)
  if (ps) {
    e.parse_state = ps
  }
  throw e
}

function parse_complete (ps) {
  return ps.stack.length === 0 &&
    ps.koff === ps.klim &&
    ps.voff === ps.vlim &&
    (ps.pos === 'F' || ps.pos === 'W')
}

module.exports = {
  tokenize: tokenize,
  TOK: TOK,
  DECIMAL_ASCII: DECIMAL_ASCII,
}
