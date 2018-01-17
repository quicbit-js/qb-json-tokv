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

  // tokenize() special codes
  BEG: 66,          // 'B'  (B)egin src.  about to tokenize a new src.
  END: 69,          // 'E'  (E)nd src. finished parsing a src.  check ps.ecode for more information.
}

var ECODE = {
  // when a tokenize() finishes a src, a non-zero ps.ecode indicates an abnormal/special end state:
  BAD_VALUE: 66,    // 'B'  encountered invalid byte or series of bytes
  TRUNC_DEC: 68,    // 'D'  end of buffer was value was a decimal ending with a digit (0-9). it is *possibly* unfinished
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
var DECIMAL_END = ascii_to_code('0123456789', 1)
var DECIMAL_ASCII = ascii_to_code('-0123456789+.eE', 1)
var TOK_BYTES = ascii_to_bytes({ f: 'alse', t: 'rue', n: 'ull' })

// skip as many bytes of src that match bsrc, up to lim.
// return
//     i    the new index after all bytes are matched (past matched bytes)
//    -i    (negative) the index of the first unmatched byte (past matched bytes)
function skip_bytes (src, off, lim, bsrc) {
  var blen = bsrc.length
  if (blen > lim - off) { blen = lim - off }
  var i = 0
  while (bsrc[i] === src[i + off] && i < blen) { i++ }
  return i === bsrc.length ? i + off : -(i + off)
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
  ps.src || err('missing src property', ps)
  ps.lim = ps.lim == null ? ps.src.length : ps.lim
  ps.tok = ps.tok || 0                             // token/byte being handled
  ps.koff = ps.koff || ps.off || 0                        // key offset
  ps.klim = ps.klim || ps.koff                            // key limit (exclusive)
  ps.voff = ps.voff || ps.klim
  ps.vlim = ps.vlim || ps.voff
  ps.stack = ps.stack || []                   // ascii codes 91 and 123 for array / object depth
  ps.pos = ps.pos || ARR_BFV                          // container context and relative position encoded as an int
  ps.ecode = ps.ecode || 0
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
          if (ps.vlim > 0)      { ps.pos = pos1; ps.vcount++; return ps.tok }
          else                  return handle_neg(ps)
        }

      case 102:                                         // f    false
      case 110:                                         // n    null
      case 116:                                         // t    true
        ps.vlim = skip_bytes(ps.src, ps.vlim, ps.lim, TOK_BYTES[ps.tok])
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)         return handle_unexp(ps)
        if (ps.vlim > 0)        { ps.pos = pos1; ps.vcount++; return ps.tok }
        else                    return handle_neg(ps)

      case 48:case 49:case 50:case 51:case 52:          // 0-4    digits
      case 53:case 54:case 55:case 56:case 57:          // 5-9    digits
      case 45:                                          // '-'    ('+' is not legal here)
        ps.tok = 100                                    // d for decimal
        ps.vlim = skip_dec(ps.src, ps.vlim, ps.lim)
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)         return handle_unexp(ps)
        if (ps.vlim > 0)        { ps.pos = pos1; ps.vcount++; return ps.tok }
        else                    return handle_neg(ps)

      case 91:                                          // [    ARRAY START
      case 123:                                         // {    OBJECT START
        pos1 = POS_MAP[ps.pos | ps.tok]
        if (pos1 === 0)                               return handle_unexp(ps)
        ps.pos = pos1
        ps.stack.push(ps.tok)
        return ps.tok

      case 93:                                          // ]    ARRAY END
        if (ps.pos !== ARR_BFV && ps.pos !== ARR_A_V) return handle_unexp(ps)
        ps.stack.pop()
        ps.pos = ps.stack[ps.stack.length - 1] === 123 ? OBJ_A_V : ARR_A_V;
        ps.vcount++; return ps.tok

      case 125:                                         // }    OBJECT END
        if (ps.pos !== OBJ_BFK && ps.pos !== OBJ_A_V) return handle_unexp(ps)
        ps.stack.pop()
        ps.pos = ps.stack[ps.stack.length - 1] === 123 ? OBJ_A_V : ARR_A_V
        ps.vcount++; return ps.tok

      default:
        --ps.vlim;
        { ps.ecode = ECODE.BAD_VALUE; return end_src(ps) }
    }
  }

  // reached src limit without error or truncation
  ps.ecode = 0
  if (NON_TOKEN[ps.tok]) {
    ps.voff = ps.vlim
  }
  return end_src(ps)
}

function end_src (ps) {
  if (ps.koff === ps.klim) { ps.koff = ps.klim = ps.voff }  // simplify state
  ps.tok = TOK.END
  return TOK.END
}

function handle_neg (ps) {
  ps.vlim = -ps.vlim
  if (ps.vlim >= ps.lim) {
    ps.ecode = ps.tok === TOK.DEC && DECIMAL_END[ps.src[ps.vlim-1]] ? ECODE.TRUNC_DEC : ECODE.TRUNCATED
  } else {
    ps.ecode = ECODE.BAD_VALUE
    ps.vlim++
  }
  return end_src(ps)
}

function handle_unexp (ps) {
  if (ps.vlim < 0) { ps.vlim = -ps.vlim }
  ps.ecode = ECODE.UNEXPECTED
  return end_src(ps)
}

function tokenize (ps, opt, cb) {
  opt = opt || {}
  init(ps)

  // continue as long as we have source
  while (true) {
    if (ps.tok === TOK.END) {
      if (ps.next_src && ps.next_src.length) {
        ps.next_src = next_src(ps, ps.next_src)
      } else {
        break
      }
    }

    ps.tok = TOK.BEG
    if (!cb(ps)) { return cb_stop(ps) }

    while (next(ps) !== TOK.END) {
      if (cb(ps) !== true) { return cb_stop(ps) }
    }

    check_err(ps)
    if (opt.finish) {
      ps.ecode !== ECODE.TRUNCATED || err('input was truncated.', ps)
      if (ps.ecode === ECODE.TRUNC_DEC) {
        ps.ecode = 0
        ps.tok = TOK.DEC
        ps.pos = POS_MAP[ps.pos | ps.tok]
        if (!cb(ps)) { return cb_stop(ps) }
        check_err(ps)
        ps.koff = ps.klim = ps.voff = ps.vlim
      }
      ps.stack.length === 0 || err('input was incomplete.', ps)
      ps.pos === ARR_A_V || ps.pos === ARR_BFV || err('trailing comma.', ps)
    }

    ps.tok = TOK.END
    if (!cb(ps)) { return cb_stop(ps) }
    check_err(ps)
  }

  return ps
}

// after callback cleans up state before returning
function cb_stop (ps) {
  // ps.koff = ps.klim = ps.voff = ps.vlim
  return ps
}

function check_err (ps) {
  if (ps.ecode === ECODE.BAD_VALUE) {
    err('bad value: ' + ps.src[ps.vlim], ps)
  }
  if (ps.ecode === ECODE.UNEXPECTED) {
    err('unexpected value', ps)
  }
}

// next_src() supports smooth transitions across two buffers - ps1.src and ps1.next_src.  It can recover from
// truncated or partial positions encountered during parsing like so:
//
//
//    while (next(ps) !== TOK.END) {...}
//    nsrc = next_src(ps, nsrc)               // set ps.src to nsrc or to a selection across ps.src and nsrc that has complete values (returning nsrc remainder)
//    while (next(ps) !== TOK.END) {...}
//    nsrc = next_src(ps, nsrc)               // set ps.src to nsrc or to a selection across ps.src and nsrc that has complete values (returning nsrc remainder)
//    ...
//
// Details:
//
// a) if ps.src ends cleanly between values (or object key/values), then ps.src will be set to ps.next_src
//    and set other ps properties to continue with the new ps.src
//
// b) if ps ends with a partial state such as truncated key, truncated value, or key
//    without value then a new ps.src is created containing enough of ps.src and ps.next_src to complete
//    a whole value or key value.  ps.next_src is sliced/reduced by the added amount and ps offsets
//    and position are *rewound* to point the value or key/value that was truncated so that next(ps) will
//    operate on the recovered value or key/value.  If the value cannot be completed with nsrc, then
//    it will still be rewound to start with the new, longer, but still incomplete value when next(ps) is called.
//
// NOTE this function is only suitable for src keys and values that fit comfortably into memory (which is pretty
// much all JSON we use today, but possibly not next-generation JSON which might have any size data).
//
function next_src (ps, nsrc) {
  var ns_lim = 0        // selection of nsrc to include up to (0 means none)
  var npos = ps.pos     // position (updated for completed truncated values)
  var ps_off = ps.lim   // selection of ps.src to keep (ps_off through ps.lim)
  var tinfo = trunc_info(ps, nsrc)
  if (tinfo) {
    ps_off = in_obj(ps.pos) ? ps.koff : ps.voff
    ns_lim = tinfo.ns_lim
    if (tinfo.pos === ps.pos) {
      // truncated value not complete
      return shift_src(ps, ps_off, nsrc, ns_lim)
    } else {
      npos = tinfo.npos // advance position
    }
  }

  // continue from ns_lim and npos...
  switch (npos) {
    case OBJ_BFK: case OBJ_B_K: case OBJ_A_V: case ARR_BFV: case ARR_B_V: case ARR_A_V:
      if (ns_lim === 0) { ns_lim = nsrc.length }    // use all next_src
      // ps.koff = ps.klim = ps.voff = ps.vlim
      return shift_src(ps, ps_off, nsrc, ns_lim)

    case OBJ_A_K: case OBJ_B_V:
      // find next position in nsrc
      var nps = {src: nsrc}
      nps.stack = ps.stack.slice()
      nps.vlim = ns_lim
      nps.pos = npos
      init(nps)
      next(nps)
      if (nps.tok === TOK.DEC && nps.vlim < nps.lim) { nps.vlim++ }   // shift truncated decimal
      return shift_src(ps, ps.koff, nsrc, nps.vlim)
  }
}

function trunc_info (ps, nsrc) {
  if (ps.ecode !== ECODE.TRUNCATED && ps.ecode !== ECODE.TRUNC_DEC) {
    return null
  }
  var ret = {}
  switch (ps.pos) {
    case OBJ_BFK: case OBJ_B_K:
      ret.ns_lim = complete_val(ps.src, ps.koff, ps.klim, nsrc)
      ret.npos = OBJ_A_K
      break
    case OBJ_B_V:
      ret.ns_lim = complete_val(ps.src, ps.voff, ps.vlim, nsrc)
      ret.npos = OBJ_A_V
      break
    case ARR_BFV: case ARR_B_V:
      ret.ns_lim = complete_val(ps.src, ps.voff, ps.vlim, nsrc)
      ret.npos = ARR_A_V
      break
  }
  if (ret.ns_lim < 0) {
    // could not complete truncated value - pos unchanged
    ret.ns_lim = -ret.ns_lim
    if (ret.ns_lim < nsrc.length) { ret.ns_lim++ }   // early stop means BAD_VALUE - include byte in selection
    ret.pos = ps.pos
  } else {
    if (ps.ecode === ECODE.TRUNC_DEC && ret.ns_lim < nsrc.length) {
      ret.ns_lim++    // include byte after decimal (avoid truncation in src)
    }
  }
  return ret
}

function shift_src (ps, ps_off, nsrc, ns_lim) {
  ns_lim > 0 || err('nothing to shift')

  // split nsrc into new nsrc and remaining amount
  var ns_remain = ns_lim === nsrc.length ? null : nsrc.slice(ns_lim)

  // combine or replace ps.src with nsrc selection
  if (ps_off === ps.lim) {
    ps.src = ns_lim === nsrc.length ? nsrc : nsrc.slice(0, ns_lim)
  } else {
    ps.src = concat_src(ps.src, ps_off, ps.lim, nsrc, 0, ns_lim)
    // ps.src is being used.  rewind position.
    ps.pos = in_obj(ps.pos) ? OBJ_B_K : ARR_B_V
  }

  // rewind position to be at value or key/value start
  ps.off = 0
  ps.koff = ps.klim = ps.voff = ps.vlim = 0
  ps.tok = ps.ecode = 0
  ps.lim = ps.src.length
  return ns_remain
}

function in_obj (pos) {
  switch (pos) {
    case OBJ_BFK: case OBJ_B_K: case OBJ_A_K: case OBJ_B_V: case OBJ_A_V: return true
    default: return false
  }
}

// ps1.src - later
// ps1.lim = ps2.lim
// ps1.tok - later
// ps.koff
// ps.klim
// ps.voff
// ps.vlim
// ps1.stack (same)
// ps.pos - later
// ps.ecode (checked = 0)
// ps.vcount (same)

function complete_val (src1, voff, vlim, src2) {
  var c = src1[voff]
  if (c === 34) {
    return skip_str(src2, 0, src2.length)
  } else if (TOK_BYTES[c]) {
    return skip_bytes(src2, 0, src2.length, TOK_BYTES[c].slice(vlim - voff - 1))
  } else {
    return skip_dec(src2, 0, src2.length)
  }
}

function concat_src (src1, off1, lim1, src2, off2, lim2) {
  var len1 = lim1 - off1
  var len2 = lim2 - off2
  var ret = new Uint8Array(len1 + len2)
  for (var i=0; i < len1; i++) { ret[i] = src1[i + off1] }
  for (i=0; i < len2; i++) { ret[i + len1] = src2[i + off2] }
  return ret
}

function err (msg, ps) {
  if (ps) {
    var pobj = Object.keys(ps).reduce(function (m,k) {m[k] = ps[k]; return m}, {})
    if (pobj.src) {
      pobj.src = Array.from(pobj.src).map(function(c){return String.fromCharCode(c)}).join('')
      msg += ': ' + JSON.stringify(pobj)
    }
  }
  var e = new Error(msg)
  e.parse_state = ps
  throw e
}

module.exports = {
  tokenize: tokenize,
  init: init,
  next: next,
  next_src: next_src,
  TOK: TOK,
  ECODE: ECODE,
}
