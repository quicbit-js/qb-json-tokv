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
var DELIM = ascii_to_code('\b\f\n\t\r ,:{}[]', 1)
var DECIMAL_ASCII = ascii_to_code('-0123456789+.eE', 1)
var TOK_BYTES = ascii_to_bytes({ f: 'alse', t: 'rue', n: 'ull' })
var VAL_TOKENS = ascii_to_code('sdtfn{}[]!XU', 1, [])       // tokens that use a value range (vlim > voff), including truncated values

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

function callback (ps, cb) {
  // clean transition was made from ps.pos to pos1
  var cb_continue = cb(ps.src, ps.koff, ps.klim, ps.tok, ps.voff, ps.vlim, null)
  ps.koff = ps.klim
  ps.voff = ps.vlim
  return cb_continue
}

function finish_dec (ps) {
  ps.vlim = skip_dec(ps.src, ps.vlim, ps.lim)
  var pos1 = POS_MAP[ps.pos | ps.tok]
  if (pos1 === 0)        { ps.vlim = ps.vlim < 0 ? -ps.vlim : ps.vlim; ps.tok = TOK.UNEXPECTED;  return false }
  else if (ps.vlim <= 0) { ps.vlim = -ps.vlim; ps.trunc = true; if (ps.vlim !== ps.lim) { ps.tok = TOK.BAD_BYT } return false }
  ps.pos = pos1
  ps.vcount++
  return true
}

function finish_fixed (ps) {
  ps.vlim = skip_bytes(ps.src, ps.vlim, ps.lim, TOK_BYTES[ps.tok])
  var pos1 = POS_MAP[ps.pos | ps.tok]
  if (pos1 === 0)        { ps.vlim = ps.vlim < 0 ? -ps.vlim : ps.vlim; ps.tok = TOK.UNEXPECTED; return false }
  else if (ps.vlim <= 0) { ps.vlim = -ps.vlim; ps.trunc = true; if (ps.vlim !== ps.lim) { ps.tok = TOK.BAD_BYT } return false }
  else                   { ps.pos = pos1; ps.vcount++; return true }
}

function finish_str (ps) {
  ps.vlim = skip_str(ps.src, ps.vlim, ps.lim)
  var pos1 = POS_MAP[ps.pos | ps.tok]
  if (pos1 === 0) { ps.vlim = ps.vlim < 0 ? -ps.vlim : ps.vlim; ps.tok = TOK.UNEXPECTED; return false }
  if (ps.vlim <= 0)  { ps.vlim = -ps.vlim; ps.trunc = true; return false }
  ps.pos = pos1
  return true
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

function tokenize (ps, opt, cb) {
  opt = opt || {}

  ps.src = ps.src || err('missing src property', ps)
  ps.lim = ps.lim == null ? ps.src.length : ps.lim
  ps.tok =  ps.tok || 0                                // token/byte being handled
  ps.koff = ps.koff || ps.off || 0                     // key offset
  ps.klim = ps.klim || ps.koff                            // key limit (exclusive)
  ps.voff = ps.voff || ps.klim
  ps.vlim = ps.vlim || ps.voff
  ps.stack = ps.stack || []                    // ascii codes 91 and 123 for array / object depth
  ps.pos = ps.pos || ARR_BFV                          // container context and relative position encoded as an int
  !ps.trunc || err('cannot handle truncated value')
  ps.vcount = ps.vcount || 0                             // number of complete values parsed
  var pos1 = ps.pos   // pos1 possibilities are:
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
  var whitespace = WHITESPACE
  ps.trunc = false   // true for truncated (incomplete) key or value
  var pcontext = 0

  var cb_continue = cb(ps.src, 0, 0, TOK.BEG, ps.vlim, ps.vlim, null)                      // 'B' - BEGIN parse
  if (cb_continue) {
    // breaking main_loop before ps.vlim == lim means callback returned falsey or we have an error
    main_loop: while (ps.vlim < ps.lim) {
      ps.voff = ps.vlim
      ps.tok = ps.src[ps.vlim++]
      switch (ps.tok) {
        case 8: case 9: case 10: case 12: case 13: case 32:
          if (whitespace[ps.src[ps.vlim]] === 1 && ps.vlim < ps.lim) {             // 119 = 'w' whitespace
            while (whitespace[ps.src[++ps.vlim]] === 1 && ps.vlim < ps.lim) {}
          }
          continue

        // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

        // the unconventional indention below aligns logic across case blocks to show similarities and highlight differences

        case 44:                                          // ,    COMMA
        case 58:                                          // :    COLON
          pos1 = pmap[ps.pos | ps.tok]
          if (pos1 === 0) { ps.voff = ps.vlim-1; ps.tok = TOK.UNEXPECTED; break main_loop }
          ps.pos = pos1
          continue

        case 34:                                          // "    QUOTE
          ps.tok = 115                                    // s for string
          if (finish_str(ps)) {
            if (ps.pos === OBJ_A_K) { ps.koff = ps.voff; ps.klim = ps.vlim; continue }
            else { ps.vcount++; break }
          }
          else {
            break main_loop
          }

        case 102:                                         // f    false
        case 110:                                         // n    null
        case 116:                                         // t    true
          if (finish_fixed(ps)) { break }
          else                  { break main_loop }

        case 48:case 49:case 50:case 51:case 52:          // 0-4    digits
        case 53:case 54:case 55:case 56:case 57:          // 5-9    digits
        case 45:                                          // '-'    ('+' is not legal here)
          ps.tok = 100                                    // d for decimal
          if (finish_dec(ps)) { break }
          else                { break main_loop }

        case 91:                                          // [    ARRAY START
        case 123:                                         // {    OBJECT START
          pos1 = pmap[ps.pos | ps.tok]
          if (pos1 === 0)             { ps.tok = TOK.UNEXPECTED; break main_loop }
          ps.pos = pos1
          ps.stack.push(ps.tok)
          break

        case 93:                                          // ]    ARRAY END
          if (ps.pos !== arr_bfv && ps.pos !== arr_a_v)
                                      { ps.tok = TOK.UNEXPECTED; break main_loop }
          pcontext = ps.stack.pop()
          ps.pos = ps.stack[ps.stack.length - 1] === 123 ? obj_a_v : arr_a_v;
          ps.vcount++
          break

        case 125:                                         // }    OBJECT END
          if (ps.pos !== obj_bfk && ps.pos !== obj_a_v)
                                      { ps.tok = TOK.UNEXPECTED; break main_loop }
          pcontext = ps.stack.pop()
          ps.pos = ps.stack[ps.stack.length - 1] === 123 ? obj_a_v : arr_a_v
          ps.vcount++
          break

        default:
          --ps.vlim;
                                      { ps.tok = TOK.BAD_BYT; break main_loop }
      }
      // clean transition was made from ps.pos to pos1
      cb_continue = cb(ps.src, ps.koff, ps.klim, ps.tok, ps.voff, ps.vlim, null)
      ps.koff = ps.klim
      ps.voff = ps.vlim
      if (cb_continue !== true && !cb_continue) {    // (checking !== true is slightly faster in node 6)
        break
      }
    }  // end main_loop: while(ps.vlim < lim) {...
  }

  var is_err = ps.tok === TOK.BAD_BYT || ps.tok === TOK.UNEXPECTED

  if (ps.vlim !== ps.voff) {
    if (!VAL_TOKENS[ps.tok]) {
      // wipe out value ranges caused by whitespace, colon, comma etc.
      ps.voff = ps.vlim
    } else {
      if (ps.stack[ps.stack.length - 1] === 123) {
        // finish moving value to key range
        if (ps.koff === ps.klim) {
          ps.koff = ps.voff
          ps.klim = ps.voff = ps.vlim
        } else  if (ps.klim === ps.vlim) {
          ps.voff =ps.vlim
        }
      }
    }
  }

  var lim = ps.lim
  // capture parse state
  ps = {
    src: ps.src,
    koff: ps.koff,
    klim: ps.klim,
    tok: is_err ? ps.tok : TOK.END,
    voff: ps.voff,
    vlim: ps.vlim,
    vcount: ps.vcount,
    stack: ps.stack,
    trunc: ps.trunc,
    pos: ps.pos,
  }

  if (!cb_continue) {
    return ps
  }

  if (!opt.incremental && ps.trunc) {
      if (DECIMAL_ASCII[ps.src[ps.voff]] && ps.stack.length === 0 && ps.vlim === lim) {
        // finished number outside of object or array context is considered done: '3.23' or '1, 2, 3'
        cb(ps.src, ps.koff, ps.klim, TOK.DEC, ps.voff, ps.vlim, null)

        ps.pos = ARR_A_V
        ps.trunc = false
        ps.voff = ps.vlim
      } else {
        err('parsing ended on truncated value.  use option {incremental: true} to enable partial parsing', ps)
      }
  }

  if (ps.tok === TOK.BAD_BYT) {
    err('bad byte: ' + ps.src[ps.vlim], ps)
  } else if (ps.tok === TOK.UNEXPECTED) {
    err('unexpected token', ps)
  } else if (!opt.incremental && !parse_complete(ps)) {
    err('input was incomplete. use option {incremental: true} to enable partial parsing', ps)

  }   // else reached limit with some other valid token

  cb(ps.src, ps.koff, ps.klim, ps.tok, ps.voff, ps.vlim, ps)
  return ps
}

function err (msg, ps) {
  var e = new Error(msg)
  e.parse_state = ps
  throw e
}

function parse_complete (ps) {
  return ps.stack.length === 0 &&
    ps.koff === ps.klim &&
    ps.voff === ps.vlim &&
    (ps.pos === ARR_BFV || ps.pos === ARR_A_V) &&
    !ps.trunc
}

function next (src, off, lim, ps) {

}

module.exports = {
  tokenize: tokenize,
  next: next,
  TOK: TOK,
  DECIMAL_ASCII: DECIMAL_ASCII,
}
