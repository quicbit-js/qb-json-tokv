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
var STATE = {
  IN_ARR:           0x0100,
  IN_OBJ:           0x0200,
  // 0x0 means no context

  // use bits 9,10,11 for the six possible positions (sqeeze max value down to 0x18FF)
  POS_MASK:         0x1C00,

  BEFORE_FIRST_KEY: 0x0400,
  BEFORE_KEY:       0x0800,   // key states can be zero because they always occur IN_OBJ context (which is non-zero)
  BEFORE_FIRST_VAL: 0x0C00,
  BEFORE_VAL:       0x1000,
  AFTER_VAL:        0x1400,
  AFTER_KEY:        0x1800,
}

// ascii tokens as well as special codes for number, error, begin and end.
var TOK = {
  // direct ascii codes - the token is represented by the first ascii byte encountered
  ARR_BEG: 91,    // '['
  ARR_END: 93,    // ']'
  OBJ_BEG: 123,   // '{'
  OBJ_END: 125,   // '}'
  FAL: 102,       // 'f'
  NUL: 110,       // 'n'
  STR: 34,        // '"'
  TRU: 116,       // 't'

  // special codes
  NUM: 78,        // 'N'  - represents a number value starting with: -, 0, 1, ..., 9
  ERR: 0,         // error.  check err_info for information
  BEG: 66,        // 'B' - begin - about to process
  END: 69,        // 'E' - end -   buffer limit reached
}

var ERR = {
  UNEXPECTED_VAL: -1,       // Same as state === 0. token is valid, but not expected
  UNEXPECTED_BYTE: -2,      // encountered invalid byte - not a token or legal number value
  TRUNCATED_VAL: -3,        // a multi-byte value (string, number, true, false, null, object-key) doesn't complete
  TRUNCATED_SRC: -4,        // src is valid, but does not complete (still in object, in array, or trailing comma, ...)
  NONE: 0,                  // no error
}

// create an int-int map from (state + tok) -- to --> (new state)
function state_map () {
  var ret = []
  var max = 0x1AFF      // accommodate all possible byte values
  for (var i=0; i <= max; i++) {
    ret[i] = 0
  }

  // map ( [ctx], [state0], tokens ) => state1
  var map = function (ctx_arr, s0_arr, chars, s1) {
    ctx_arr.forEach(function (ctx) {
      s0_arr.forEach(function (s0) {
        for (var i = 0; i < chars.length; i++) {
          ret[ctx|s0|chars.charCodeAt(i)] = s1
        }
      })
    })
  }

  var bfv = STATE.BEFORE_FIRST_VAL
  var b_v = STATE.BEFORE_VAL
  var a_v = STATE.AFTER_VAL
  var bfk = STATE.BEFORE_FIRST_KEY
  var b_k = STATE.BEFORE_KEY
  var a_k = STATE.AFTER_KEY
  var arr = STATE.IN_ARR
  var obj = STATE.IN_OBJ
  var non = 0

  var val = '"ntf-0123456789' // all legal value starts (ascii)

  // 0 = no context (comma separated values)
  // (s0 ctxs +       s0 positions + tokens) -> s1
  map([non],          [bfv,b_v],    val,      a_v)
  map([non],          [a_v],        ',',      b_v)

  map([non,arr,obj],  [bfv,b_v],    '[',      arr|bfv)
  map([non,arr,obj],  [bfv,b_v],    '{',      obj|bfk)

  map([arr],          [bfv,b_v],    val,      arr|a_v)
  map([arr],          [a_v],        ',',      arr|b_v)
  map([arr],          [bfv,a_v],    ']',      a_v)          // s1 context not set here. it is set by checking the stack

  map([obj],          [a_v],        ',',      obj|b_k)
  map([obj],          [bfk,b_k],    '"',      obj|a_k)
  map([obj],          [a_k],        ':',      obj|b_v)
  map([obj],          [b_v],        val,      obj|a_v)
  map([obj],          [bfk,a_v],    '}',      a_v)          // s1 context not set here. it is set by checking the stack

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
  while (bsrc[i] === src[i + off] && i < blen) {i++}
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
  ret.state = init.state || STATE.BEFORE_FIRST_VAL
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
  var pos_mask = STATE.POS_MASK
  var after_key = STATE.AFTER_KEY
  var in_arr = STATE.IN_ARR
  var in_obj = STATE.IN_OBJ
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
        case 9:
        case 10:
        case 13:
        case 32:
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

        case 102:
        case 110:
        case 116:
          idx = skip_bytes(src, idx, lim, tok_bytes[tok])
          if (idx <= 0) {
            // not all bytes matched
            idx = -idx
            state1 = states[state0 | tok]
            if (state1 !== 0) {
              state0 = state1;
              state1 = ERR.TRUNCATED_VAL
            }
            // else is transition error (state1 = 0)
            break main_loop
          }
          // full match
          state1 = states[state0 | tok]
          if (state1 === 0) { break main_loop }
          break

        case 34:                                  // "    QUOTE
          state1 = states[state0 | tok]
          idx = skip_str(src, idx + 1, lim, 34, 92)
          if (idx === -1) {
            // break for bad transition (state1 === 0) or for truncation, in that order.
            idx = lim
            if (state1 !== 0) {
              state0 = state1;
              state1 = ERR.TRUNCATED_VAL
            }
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

        case 48:
        case 49:
        case 50:
        case 51:
        case 52:   // digits 0-4
        case 53:
        case 54:
        case 55:
        case 56:
        case 57:   // digits 5-9
        case 45:                                   // '-'   ('+' is not legal here)
          state1 = states[state0 | tok]
          tok = 78                                // N  Number
          while (all_num_chars[src[++idx]] === 1 && idx < lim) {}
          if (state1 === 0) { break main_loop }
          // the number *might* be truncated - flag it here and handle below
          if (idx === lim) {
            state0 = state1;
            state1 = ERR.TRUNCATED_VAL;
            break main_loop
          }
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
          if (stack.length !== 0) { state1 |= (stack[stack.length - 1] === 91 ? in_arr : in_obj)}
          break

        default:
          state1 = ERR.UNEXPECTED_BYTE          // no legal transition for this token
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
        sep_chars[src[voff-1]] ||
        WHITESPACE[src[voff-1]]

      info = new_info(state0, is_separate ? ERR.UNEXPECTED_VAL : ERR.UNEXPECTED_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR.UNEXPECTED_BYTE:
      info = new_info(state0, ERR.UNEXPECTED_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR.TRUNCATED_VAL:
      if (tok === TOK.NUM && (state0 === (STATE.BEFORE_FIRST_VAL) || state0 === (STATE.AFTER_VAL))) {
        // numbers outside of object or array context are not considered truncated: '3.23' or '1, 2, 3'
        cb(src, koff, klim, tok, voff, idx, null)
        cb(src, -1, -1, TOK.END, idx, idx, null)
        info = null
      } else {
        info = new_info(state1, ERR.TRUNCATED_VAL)
        cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, voff, idx, info)
      }
      break

    //
    // complete end states
    //
    case STATE.BEFORE_FIRST_VAL:
    case STATE.AFTER_VAL:
      cb(src, -1, -1, TOK.END, idx, idx, null)
      break

    //
    // incomplete end states (in object, in array, trailing comma...)
    //
    default:
      if (cb_continue) {
        // incomplete state was not caused of the callback halting process
        info = new_info(state1, ERR.TRUNCATED_SRC)
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
  state_str: function () {
    if (this.state == null) {
      return 'undefined'
    }
    var ctx = this.context()
    return (ctx ? 'in ' + ctx + ', ' : '') + this.position()
  },
  context: function () {
    return (this.state & STATE.IN_ARR) ? 'array' : (this.state & STATE.IN_OBJ) ? 'object' : null
  },
  rposition: function () {
    if (this.err === ERR.TRUNCATED_VAL) { return 'inside' }
    switch (this.state & STATE.POS_MASK) {
      case STATE.AFTER_KEY: case STATE.AFTER_VAL: return 'after'
      default: return 'before'
    }
  },
  first: function () {
    switch (this.state & STATE.POS_MASK) {
      case STATE.BEFORE_FIRST_KEY: case STATE.BEFORE_FIRST_VAL: return true
      default: return false
    }
  },
  key: function () {
    switch (this.state & STATE.POS_MASK) {
      case STATE.BEFORE_FIRST_KEY: case STATE.BEFORE_KEY: case STATE.AFTER_KEY: return true
      default: return false
    }
  },
  tok_type: function () {
      switch (this.tok) {
        case TOK.NUM: return 'number'
        case TOK.STR: return 'string'
        default: return 'token'
      }
  },
  position: function () {
    // can't just map state to strings - need to take this.err into account for 'inside' case.
    return this.rposition() + ' ' + (this.first() ? 'first ' : '') + (this.key() ? 'key' : 'value')
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
      case ERR.TRUNCATED_VAL:
        ret = 'truncated ' + (this.key() ? 'key' : 'value')
        break
      case ERR.UNEXPECTED_VAL:
        ret = 'unexpected ' + this.tok_type() + ' ' + srcstr(src, voff, idx, tok) + ', ' + this.state_str()
        break
      case ERR.UNEXPECTED_BYTE:
        ret = 'unexpected byte ' + srcstr([tok], 0, 1, tok) + ', ' + this.state_str()
        from = this.idx - 1
        break
      case ERR.TRUNCATED_SRC:
        ret = 'truncated input, ' + this.state_str()
        from = thru = this.idx
        break
      default:
        ret = this.state_str()
        thru = idx
    }
    // var tokstr = (tok > 31 && tok < 127 && tok !== 34) ? '"' + String.fromCharCode(tok) + '"' : String(tok)
    return ret + ', at ' + ((from === thru) ? from : from + '..' + thru)
  }
}

function srcstr (src, off, lim, tok) {
  var ret = ''
  for (var i=off; i<lim; i++) {
    var b = src[i]
    ret += (b > 31 && b < 127) ? String.fromCharCode(b) : '0x' + b.toString(16)
  }
  return (tok === TOK.STR || tok === TOK.NUM) ? ret : '"' + ret + '"'
}

function err (msg ) { throw Error(msg) }

// a convenience function for summarizing/logging/debugging callback arguments as compact strings
function args2str(koff, klim, tok, voff, vlim, info) {
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
      ret = '!' + vlen + '@' + voff
      if (info) { ret += ': ' + info.toString()}
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
  TOK: TOK,
  STATE: STATE,
  ERR: ERR,
}
