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

var POS_NAMES = Object.keys(POS).reduce(function (a,n) { a[POS[n]] = n; return a }, [])
function pos_str (pos, long) {
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

// state upper range uses these error codes:
var ERR_CODE = {
  UNEXP_VAL: 0x2001,    // token is well-formed, but not expected.  i.e. (state0 + tok) -> 0.
  UNEXP_BYTE: 0x2002,   // encountered invalid byte - not a token or legal number value
  TRUNC_VAL: 0x2003,    // a multi-byte value (string, number, true, false, null, object-key) doesn't complete
  TRUNC_SRC: 0x2004,    // src is valid, but does not complete (still in object, in array, or trailing comma, ...)
  NONE: 0               // no error
}

var ERR = {
  UNEXP_VAL: 'UNEXP_VAL',
  UNEXP_BYTE: 'UNEXP_BYTE',
  TRUNC_VAL: 'TRUNC_VAL',
  TRUNC_SRC: 'TRUNC_SRC',
  NONE: 'NONE',
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


function concat (src1, off1, lim1, src2, off2, lim2) {
  var len1 = lim1 - off1
  var len2 = lim2 - off2
  var ret = new Uint8Array(len1 + len2)
  for (var i=0; i< len1; i++) { ret[i] = src1[i+off1] }
  for (i=0; i<len2; i++) { ret[i+len1] = src2[i+off2] }
  return ret
}

function err (msg) { throw Error(msg) }
function restore_truncated (src, init, ret, cb) {
  switch (init.tok) {
    case TOK.STR:
      var i = skip_str(src, init.off, init.lim)
      i !== -1 || err('could not complete truncated value')
      i++     // skip quote
      // var src = concat(init.src.slice(init.voff, init.lim), src,
      ret.off = i
      // ret.state = ((init.state & !POS_MASK) | AFTER)      // INSIDE -> AFTER

      break

  }
}

function restore (src, opt, cb) {
  var ret = {}
  var init = opt.init || {}
  if (init.err) {
    switch (init.err) {
      case ERR.TRUNC_VAL:
        restore_truncated(src, init, ret, cb)
        break
    }
  }
  ret.soff = init.soff || 0   // src offset
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
            if (state1 !== 0) { state1 = ERR_CODE.TRUNC_VAL }
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
            if (state1 !== 0) { state1 = ERR_CODE.TRUNC_VAL }
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
          if (idx === lim) { state1 = ERR_CODE.TRUNC_VAL; break main_loop }
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
          state1 = ERR_CODE.UNEXP_BYTE          // no legal transition for this token
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

  // same info is passed to callbacks as error and end events as well as returned from this function
  var stackstr = stack.map(function (b) { return String.fromCharCode(b) }).join('') || '-'
  var end_info = function (state, err) {
    return new EndInfo(idx, state, stackstr, err)
  }
  var err_info = function (state, err) {
    var val_str = srcstr(src, voff, idx, tok)
    var tok_str = tok === TOK.NUM ? 'number' : (tok === TOK.STR ? 'string' : 'token')
    return new ErrInfo(val_str, tok_str, voff, idx, state, stackstr, err)
  }

  var info = null

  switch (state1) {
    //
    // error states
    //
    case 0:
      // failed transition (state0 + tok => state1) === 0
      var sep_chars = ascii_to_code('{[]},:"', 1)
      var is_separate =
        voff === (opt.off || 0) ||
        sep_chars[tok] ||
        sep_chars[src[voff - 1]] ||
        WHITESPACE[src[voff - 1]]

      info = err_info(state0, is_separate ? ERR.UNEXP_VAL : ERR.UNEXP_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR_CODE.UNEXP_BYTE:
      info = err_info(state0, ERR.UNEXP_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR_CODE.TRUNC_VAL:
      // truncated values do NOT advance state. state0 is left one step before the transition (like unexpected values)
      if (tok === TOK.NUM && (state0 === (POS.BFV) || state0 === (POS.B_V))) {
        // numbers outside of object or array context are not considered truncated: '3.23' or '1, 2, 3'
        cb(src, koff, klim, tok, voff, idx, null)
        cb(src, -1, -1, TOK.END, idx, idx, null)
        info = null
      } else {
        if (opt.incremental) {
          info = end_info(state0, ERR.TRUNC_VAL)
          cb(src, koff, klim, TOK.END, voff, idx, info)
        } else {
          info = err_info(state0, ERR.TRUNC_VAL)
          cb(src, koff, klim, TOK.ERR, voff, idx, info)
        }
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
        if (opt.incremental) {
          info = end_info(state1, ERR.TRUNC_SRC)
          cb(src, koff, klim, TOK.END, idx, idx, info)
        } else {
          info = err_info(state1, ERR.TRUNC_SRC)
          cb(src, koff, klim, TOK.ERR, idx, idx, info)
        }
      } else {
        // callback requested stop.  don't create end event or error, but do return state so parsing can be restarted.
        info = end_info(state1, ERR.NONE)
      }
  }

  return info
}

//
//
// packet start and end information.
//
//                  (across packets)      /         (local to packet)
//
//                  packet num
//                  |
//                  |      value-count (total)
//                  |      |
//                  |      | byte-count (total)
//                  |      | |
//                  |      | |                      value-count ( local - in packet )
//                  |      | |                      |
//                  |      | |                      | byte-count (local - in packet )
//                  |      | |                      | |
//                  |      | |                      | |     stack (inside object, array, object...)
//                  |      | |                      | |     |
//                  |      | |                      | |     |   position (before-value, after-key, etc)
//                  |      | |                      | |     |   |
// begin 1          1 /    0.0            /         0.0 /   - / bfv     // before-first-value (no context)
// end   1          1 /   3.53            /        3.53 /  {[ / bv      // before-value (inside array)
//
// begin 2          2 /   3.53            /         0.0 /  {[ / bfv
// end   2          2 /  8.103            /        5.50 / {[{ / ak      // after-key
//
// begin 3          3 /  8.103            /        0.00 / {[{ / ak
// end   3          3 / 15.184            /        7.81 /   { / bv      // before-value
//
// begin 4          4 / 15.184            /         0.0 /   { / bv
// end   4          4 / 18.193            /         3.9 /   - / av      // clean end state
//
// EndInfo holds the "local-to-packet" information, plus any unfinished/truncated value needed
// to process the next packet, or no truncated value if parsing ended unambiguously outside of a value.
// The "across packets" data is managed outside of tokenize by adding up the packet values.
//
// ErrInfo holds the same information as EndInfo including any unfinished last-value, but with an error code.
function EndInfo (idx, state, stack, err) {
  this.idx = idx
  this.stack = stack
  this.err = err
  // new state
  this.pos = state & POS_MASK
}
EndInfo.prototype = {
  constructor: EndInfo,
  state_str: function (long) { return state_str(this.stack, this.pos, long) },
  toString: function () {
    return 'end info'
  }
}

function ErrInfo (val_str, tok_str, voff, idx, state, stack, err) {
  this.val_str = val_str
  this.tok_str = tok_str
  this.voff = voff
  this.idx = idx
  this.stack = stack
  this.err = err

  // new state
  this.pos = state & POS_MASK
}
ErrInfo.prototype = {
  constructor: ErrInfo,
  state_str: function (long) { return state_str(this.stack, this.pos, long) },
  toString: function () {
    switch (this.err) {
      case ERR.TRUNC_VAL:  return 'truncated ' + this.tok_str + ','           + ' at ' + rangestr(this.voff, this.idx)
      case ERR.TRUNC_SRC:  return 'truncated input, ' + this.state_str(true)  + ' at ' + this.idx
      case ERR.UNEXP_VAL:  return 'unexpected ' + this.tok_str + ' ' + this.val_str + ', ' + this.state_str(true) + ' at ' + rangestr(this.voff, this.idx)
      case ERR.UNEXP_BYTE: return 'unexpected byte '                 + this.val_str + ', ' + this.state_str(true) + ' at ' + this.voff
    }
  }
}

function rangestr(off, lim) {
  return (off === lim - 1) ? off : off + '..' + (lim - 1)
}

function ctx_str (stack, long) {
  if (stack === '-') { return '' }
  var in_obj = stack[stack.length-1] === '{'
  return in_obj ? (long ? 'in object' : 'OBJ') : (long ? 'in array' : 'ARR')
}

function state_str (stack, pos, long) {
  var ctxstr = ctx_str(stack, long)
  var posstr = pos_str(pos, long)
  var sep = long ? ' ' : '_'
  return (ctxstr ? ctxstr + sep : '') + posstr
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
