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

// STATES   - LSB is reserved for token ascii value.  see readme
var CTX_MASK = 0x0300
var CTX = {
  // 0x0 means no context
  ARR: 0x0100,
  OBJ: 0x0200,
}

var POS_MASK = 0x1C00
var POS = {
  BFK: 0x0400,
  B_K: 0x0800,
  BFV: 0x0C00,
  B_V: 0x1000,
  A_V: 0x1400,
  A_K: 0x1800,
}


// ascii tokens as well as special codes for number, error, begin and end.
var TOK = {
  // ascii codes - the token is represented by the first ascii byte encountered
  ARR: 91,        // '['
  ARR_END: 93,    // ']'
  OBJ: 123,       // '{'
  OBJ_END: 125,   // '}'
  FAL: 102,       // 'f'
  NUL: 110,       // 'n'
  STR: 34,        // '"'
  TRU: 116,       // 't'

  // special codes
  NUM: 78,        // 'N'  - represents a number value starting with: -, 0, 1, ..., 9
  ERR: 0,         // error.  check err_info for information
  BEG: 66,        // 'B' - begin - about to process
  END: 69        // 'E' - end -   buffer limit reached
}

var ERR = {
  UNEXP_VAL: -1,    // token is well-formed, but not expected.  i.e. (state0 + tok) -> 0.
  UNEXP_BYTE: -2,   // encountered invalid byte - not a token or legal number value
  TRUNC_VAL: -3,    // a multi-byte value (string, number, true, false, null, object-key) doesn't complete
  TRUNC_SRC: -4,    // src is valid, but does not complete (still in object, in array, or trailing comma, ...)
  NONE: 0          // no error
}

// create an int-int map from (state + tok) -- to --> (new state)
function state_map () {
  var ret = []
  var max = 0x1AFF      // accommodate all possible byte values
  for (var i = 0; i <= max; i++) {
    ret[i] = 0
  }

  // map ( [ctx], [state0], [ascii] ) => state1
  var map = function (ctx_arr, s0_arr, chars, s1) {
    ctx_arr.forEach(function (ctx) {
      s0_arr.forEach(function (s0) {
        for (var i = 0; i < chars.length; i++) {
          ret[ctx | s0 | chars.charCodeAt(i)] = s1
        }
      })
    })
  }

  var bfv = POS.BFV
  var b_v = POS.B_V
  var a_v = POS.A_V
  var bfk = POS.BFK
  var b_k = POS.B_K
  var a_k = POS.A_K
  var arr = CTX.ARR
  var obj = CTX.OBJ
  var non = 0

  var val = '"ntf-0123456789' // all legal value starts (ascii)

  // 0 = no context (comma separated values)
  // (s0 ctxs +       s0 positions + tokens) -> s1
  map([non], [bfv, b_v], val, a_v)
  map([non], [a_v], ',', b_v)

  map([non, arr, obj], [bfv, b_v], '[', arr | bfv)
  map([non, arr, obj], [bfv, b_v], '{', obj | bfk)

  map([arr], [bfv, b_v], val, arr | a_v)
  map([arr], [a_v], ',', arr | b_v)
  map([arr], [bfv, a_v], ']', a_v)          // s1 context not set here. it is set by checking the stack

  map([obj], [a_v], ',', obj | b_k)
  map([obj], [bfk, b_k], '"', obj | a_k)
  map([obj], [a_k], ':', obj | b_v)
  map([obj], [b_v], val, obj | a_v)
  map([obj], [bfk, a_v], '}', a_v)          // s1 context not set here. it is set by checking the stack

  return ret
}

var STATE_MAP = state_map()

function ascii_to_code (s, code) {
  var ret = []
  for (var i = 0; i < s.length; i++) { ret[s.charCodeAt(i)] = code }
  return ret
}

function ascii_to_bytes (bychar) {
  return Object.keys(bychar).reduce(function (a, c) {
    a[c.charCodeAt(0)] = bychar[c].split('').map(function (c) { return c.charCodeAt(0) })
    return a
  }, [])
}

var WHITESPACE = ascii_to_code('\n\t\r ', 1)
var ALL_NUM_CHARS = ascii_to_code('-0123456789+.eE', 1)
var TOK_BYTES = ascii_to_bytes({ f: 'false', t: 'true', n: 'null' })

// skip as many bytes of src that match bsrc, up to lim.
// return
//     idx    the new index after all bytes are matched (past matched bytes)
//    -idx    (negative) the index of after first unmatched byte
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
          return i
        }
      } else {
        return i
      }
    }
  }
  return -1
}

/*
function concat (src1, off1, lim1, src2, off2, lim2) {
  var len1 = lim1 - off1
  var len2 = lim2 - off2
  var ret = new Uint8Array(len1 + len2)
  for (var i=0; i< len1; i++) { ret[i] = src1[i+off1] }
  for (i=0; i<len2; i++) { ret[i+len1] = src2[i+off2] }
  return ret
}

function restore_truncated (src, init, ret, cb) {
  switch (init.tok) {
    case TOK.STR:
      var i = skip_str(src, init.off, init.lim)
      if (i === -1) {
        ret.lim = init.lim
        // state is still INSIDE string
      } else {
        // found end of string
        i++     // skip quote
        // var src = concat(init.src.slice(init.voff, init.lim), src,
        ret.off = i
        // ret.state = ((init.state & !POS_MASK) | AFTER)      // INSIDE -> AFTER
      }

      break

  }
}
*/
function restore (src, opt, cb) {
  var ret = {}
  var init = opt.init || {}
  ret.stack = init.stack || []
  ret.state = init.state || POS.BFV
  ret.koff = init.koff || -1
  ret.klim = init.klim || -1
  // if (init.state) {
  //   if ((init.state & POS_MASK) === INSIDE) {
  //     restore_truncated(src, init, ret, cb)
  //   } else {
  //     ret.state = init.state
  //   }
  // } else {
  //   init.state = BEFORE|FIRST|VAL
  // }
  return ret
}

function tokenize (src, opt, cb) {
  // localized constants for faster access
  var states = STATE_MAP
  var pos_mask = POS_MASK
  var after_key = POS.A_K
  var in_arr = CTX.ARR
  var in_obj = CTX.OBJ
  var whitespace = WHITESPACE
  var all_num_chars = ALL_NUM_CHARS
  var tok_bytes = TOK_BYTES

  opt = opt || {}
  var init = restore(src, opt, cb)
  var koff = init.koff
  var klim = init.klim
  var state0 = init.state
  var stack = init.stack

  var idx = opt.off || 0
  var lim = opt.lim == null ? src.length : opt.lim
  var tok = 0                         // current token/byte being handled
  var state1 = state0                 // state1 possibilities are:
                                      //    1. state1 < 0    (parse error - see STATE_ERR codes)
                                      //    2. state1 = 0    (unsupported transition - will be later be mapped to TOK.UNEXPECTED_TOK)
                                      //    3. state1 > 0    (OK.  state1 !== state0 means callback is pending )

  var voff = idx                      // value start index

  // BEG and END signals are the only calls with zero length (voff === vlim)
  var cb_continue = cb(src, -1, -1, TOK.BEG, idx, idx)                      // 'B' - BEGIN parse
  if (cb_continue) {
    // breaking main_loop before idx == lim means we have an error
    main_loop: while (idx < lim) {
      voff = idx
      tok = src[idx]
      switch (tok) {
        case 9:case 10:case 13:case 32:
          if (whitespace[src[++idx]] && idx < lim) {
            while (whitespace[src[++idx]] === 1 && idx < lim) {}
          }
          continue

        // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

        case 44:                                  // ,    COMMA
        case 58:                                  // :    COLON
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { break main_loop }
          state0 = state1
          continue

        case 102:                                 // f    false
        case 110:                                 // n    null
        case 116:                                 // t    true
          idx = skip_bytes(src, idx, lim, tok_bytes[tok])
          state1 = states[state0 | tok]
          if (idx <= 0) {
            // not all bytes matched
            idx = -idx
            if (state1 !== 0) { state1 = ERR.TRUNC_VAL }
            break main_loop
          }
          // full match
          if (state1 === 0) { break main_loop }
          break

        case 34:                                  // "    QUOTE
          state1 = states[state0 | tok]
          idx = skip_str(src, idx + 1, lim, 34, 92)
          if (idx === -1) {
            // break for bad transition (state1 === 0) or for truncation, in that order.
            idx = lim
            if (state1 !== 0) { state1 = ERR.TRUNC_VAL }
            break main_loop
          }
          idx++    // skip quote
          if (state1 === 0) { break main_loop }

          // key
          if ((state1 & pos_mask) === after_key) {
            koff = voff
            klim = idx
            state0 = state1
            continue
          }
          break

        case 48:case 49:case 50:case 51:case 52:   // digits 0-4
        case 53:case 54:case 55:case 56:case 57:   /* digits 5-9 */
        case 45:                                   // '-'   ('+' is not legal here)
          state1 = states[state0 | tok]
          tok = 78                                // N  Number
          while (all_num_chars[src[++idx]] === 1 && idx < lim) {}
          if (state1 === 0) { break main_loop }
          // the number *might* be truncated - flag it here and handle below
          if (idx === lim) { state1 = ERR.TRUNC_VAL; break main_loop }
          break

        case 91:                                  // [    ARRAY START
        case 123:                                 // {    OBJECT START
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { break main_loop }
          stack.push(tok)
          break

        case 93:                                  // ]    ARRAY END
        case 125:                                 // }    OBJECT END
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { break main_loop }
          stack.pop()
          // state1 context is unset after closing brace (see state map).  we set it here.
          if (stack.length !== 0) { state1 |= (stack[stack.length - 1] === 91 ? in_arr : in_obj) }
          break

        default:
          state1 = ERR.UNEXP_BYTE          // no legal transition for this token
          idx++
          break main_loop
      }

      // clean transition was made from state0 to state1
      cb_continue = cb(src, koff, klim, tok, voff, idx, null)
      if (state0 & in_obj) {
        koff = -1
        klim = -1
      }
      state0 = state1
      if (cb_continue === true || cb_continue) {    // === check is slightly faster (node 6)
        continue
      }
      break
    }  // end main_loop: while(idx < lim) {...
  }

  // similar info is passed to callbacks as error and end events as well as returned from this function
  var new_info = function (state, err) {
    return new Info(src, lim, koff, klim, tok, voff, idx, state, stack, err)
  }
  var info = null

  switch (state1) {
    //
    // error states
    //
    case 0:
      var sep_chars = ascii_to_code('{[]},:"', 1)
      var is_separate =
        voff === (opt.off || 0) ||
        sep_chars[tok] ||
        sep_chars[src[voff - 1]] ||
        WHITESPACE[src[voff - 1]]

      info = new_info(state0, is_separate ? ERR.UNEXP_VAL : ERR.UNEXP_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR.UNEXP_BYTE:
      info = new_info(state0, ERR.UNEXP_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR.TRUNC_VAL:
      // truncated values do NOT advance state. state0 is left one step before the transition (like unexpected values)
      if (tok === TOK.NUM && (state0 === (POS.BFV) || state0 === (POS.B_V))) {
        // numbers outside of object or array context are not considered truncated: '3.23' or '1, 2, 3'
        cb(src, koff, klim, tok, voff, idx, null)
        cb(src, -1, -1, TOK.END, idx, idx, null)
        info = null
      } else {
        info = new_info(state0, ERR.TRUNC_VAL)
        cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, voff, idx, info)
      }
      break

    //
    // complete end states (no context)
    //
    case POS.BFV:
    case POS.A_V:
      cb(src, -1, -1, TOK.END, idx, idx, idx === lim ? null : info)
      break

    //
    // incomplete end states (in object, in array, trailing comma...)
    //
    default:
      if (cb_continue) {
        // incomplete state was not caused of the callback halting process
        info = new_info(state1, ERR.TRUNC_SRC)
        cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, idx, idx, info)
      } else {
        // callback requested stop.  don't create end event or error, but do return state so parsing can be restarted.
        info = new_info(state1, ERR.NONE)
      }
  }

  return info
}

function Info (src, lim, koff, klim, tok, voff, idx, state, stack, err) {
  this.src = src
  this.lim = lim
  this.koff = koff
  this.klim = klim
  this.tok = tok
  this.voff = voff
  this.idx = idx
  this.state = state
  this.stack = stack
  this.err = err
}
Info.prototype = {
  constructor: Info,
  in_arr: function () { return !!(this.state & CTX.ARR) },
  in_obj: function () { return !!(this.state & CTX.OBJ) },
  ctx_str: function (long) { return ctx_str(this.state, long) },
  pos_str: function (long) { return pos_str(this.state, long) },
  state_str: function (long) { return state_str(this.state, long) },
  tok_type: function () {
    switch (this.tok) {
      case TOK.NUM: return 'number'
      case TOK.STR: return 'string'
      default: return 'token'
    }
  },
  toString: function () {
    var tok = this.tok
    var src = this.src
    var idx = this.idx
    var voff = this.voff

    var from = voff
    var thru = idx - 1
    var ret
    switch (this.err) {
      case ERR.TRUNC_VAL:
        ret = 'truncated ' + this.tok_type() + ','
        break
      case ERR.UNEXP_VAL:
        ret = 'unexpected ' + this.tok_type() + ' ' + srcstr(src, voff, idx, tok) + ', ' + this.state_str(true)
        break
      case ERR.UNEXP_BYTE:
        ret = 'unexpected byte ' + srcstr([tok], 0, 1, tok) + ', ' + this.state_str(true)
        from = this.idx - 1
        break
      case ERR.TRUNC_SRC:
        ret = 'truncated input, ' + this.state_str(true)
        from = thru = this.idx
        break
      default:
        ret = this.tok_type()
        thru = idx
    }
    // var tokstr = (tok > 31 && tok < 127 && tok !== 34) ? '"' + String.fromCharCode(tok) + '"' : String(tok)
    return ret + ' at ' + ((from === thru) ? from : from + '..' + thru)
  }
}

var POS_NAMES = Object.keys(POS).reduce(function (a,n) { a[POS[n]] = n; return a }, [])
function pos_str (state, long) {
  var pos = state & POS_MASK
  if (long) {
    switch (pos) {
      case POS.BFV: return 'before first value'
      case POS.B_V: return 'before value'
      case POS.BFK: return 'before first key'
      case POS.B_K: return 'before key'
      case POS.A_V: return 'after value'
      case POS.A_K: return 'after key'
      default: return 'undefined'
    }
  } else {
    return POS_NAMES[pos]
  }
}

function ctx_str (state, long) {
  var ctx = state & CTX_MASK
    switch (ctx) {
    case CTX.ARR: return long ? 'in array' : 'ARR'
    case CTX.OBJ: return long ? 'in object' : 'OBJ'
    default: return ''
  }
}

function state_str (state, long) {
  var ctx = ctx_str(state, long)
  var sep = long ? ' ' : '_'
  return (ctx ? ctx + sep : '') + pos_str(state, long)
}

function srcstr (src, off, lim, tok) {
  var ret = ''
  for (var i = off; i < lim; i++) {
    var b = src[i]
    ret += (b > 31 && b < 127) ? String.fromCharCode(b) : '0x' + b.toString(16)
  }
  return (tok === TOK.STR || tok === TOK.NUM) ? ret : '"' + ret + '"'
}

// a convenience function for summarizing/logging/debugging callback arguments as compact strings
function args2str (koff, klim, tok, voff, vlim, info) {
  var ret
  var vlen = vlim - voff
  switch (tok) {
    case TOK.STR:
      ret = 'S' + vlen + '@' + voff
      break
    case TOK.NUM:
      ret = 'N' + vlen + '@' + voff
      break
    case TOK.ERR:
      ret = '!' + vlen + '@' + voff + ': ' + info.toString()
      break
    default:
      ret = String.fromCharCode(tok) + '@' + voff
  }
  if (koff !== -1) {
    ret = 'K' + (klim - koff) + '@' + koff + ':' + ret
  }
  return ret
}

module.exports = {
  tokenize: tokenize,
  args2str: args2str,
  state_str: state_str,
  TOK: TOK,
  CTX: CTX,     // state 3-letter codes - for concise expressions
  POS: POS,
  POS_MASK: POS_MASK,
  ERR: ERR,
}
