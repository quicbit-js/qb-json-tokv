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
var IN_ARR =   0x1000
var IN_OBJ =   0x0800

var BEFORE =   0x0000    // just for readability CTX_OBJ|BEFORE|FIRST|KEY, etc...
var AFTER =    0x0400
               
var FIRST =    0x0200    // is first value in an object or array
               
var KEY =      0x0000    // not necessary, but easier to read: BEFORE|FIRST|VAL, AFTER|FIRST|KEY, etc.
var VAL =      0x0100

// create an int-int map from (state + tok) -- to --> (new state)
function state_map () {
  var ret = []
  var max = 0x01FFF      // accommodate all possible byte values
  for (var i=0; i <= max; i++) {
    ret[i] = 0
  }

  // map ( [state0], tokens ) => state1
  var map = function (s0_arr, chars, s1) {
    s0_arr.forEach(function (s0) {
      for (var i = 0; i < chars.length; i++) {
        ret[s0 | chars.charCodeAt(i)] = s1
      }
    })
  }

  var BFV = BEFORE|FIRST|VAL
  var BV = BEFORE|VAL
  var AV = AFTER|VAL
  var BFK = BEFORE|FIRST|KEY
  var BK = BEFORE|KEY
  var AK = AFTER|KEY

  var val = '"ntf-0123456789' // all legal value start bytes

  map([BFV, IN_ARR|BFV, IN_OBJ|BFV, BV, IN_ARR|BV, IN_OBJ|BV], '[', IN_ARR|BFV)
  map([BFV, IN_ARR|BFV, IN_OBJ|BFV, BV, IN_ARR|BV, IN_OBJ|BV], '{', IN_OBJ|BFK)
  map([BFV, BV], val, AV)

  map([IN_ARR|BFV, IN_ARR|BV], val, IN_ARR|AV)
  map([IN_ARR|BFV, IN_ARR|AV], ']', AV)   // empty array

  // end array or object. context is not set here. it will be set by checking the stack
  map([IN_OBJ|BFK, IN_OBJ|AV], '}', AV)   // empty object

  // values (no context)
  map([AV], ',', BV)
  map([IN_ARR|AV], ',', IN_ARR|BV)
  map([IN_OBJ|AV], ',', IN_OBJ|BK)

  // object fields
  map([IN_OBJ|BFK, IN_OBJ|BK], '"', IN_OBJ|AK)
  map([IN_OBJ|AK], ':', IN_OBJ|BV)
  map([IN_OBJ|BV], val, IN_OBJ|AV)

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
        ret.state = ((init.state & !POS_MASK) | AFTER)      // INSIDE -> AFTER
      }

      break

  }
}

function restore (src, opt, cb) {
  var ret = {}
  var init = opt.init || {}
  ret.stack = init.stack || []
  ret.state = init.state || BEFORE|FIRST|VAL
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
  var in_arr = IN_ARR
  var in_obj = IN_OBJ
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

  var cb_continue = true              // result from callback. truthy to continue processing
  var voff = idx                      // value start index

  // BEG and END signals are the only calls with zero length (voff === vlim)
  cb(src, -1, -1, TOK.BEG, idx, idx)                      // 'B' - BEGIN parse

  // breaking main_loop before idx == lim means we have an error
  main_loop: while (idx < lim) {
    voff = idx
    tok = src[idx]
    switch (tok) {
      case 9: case 10: case 13: case 32:
        if (whitespace[src[++idx]] && idx < lim) {
          while (whitespace[src[++idx]] === 1 && idx < lim) {}
        }
        continue

      // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

      case 44:                                  // ,    COMMA
      case 58:                                  // :    COLON
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        idx++
        state0 = state1
        continue

      case 102:
      case 110:
      case 116:
        idx = skip_bytes(src, idx, lim, tok_bytes[tok])
        if (idx <= 0) {
          // not all bytes matched
          idx = -idx
          if (idx === lim) {
            state1 = states[state0|tok]
            if (state1 !== 0) { state0 = state1; state1 = ERR_STATE.TRUNCATED_TOK }
            // else is transition error (state1 = 0)
          } else {
            idx++   // include the bad byte in the selection (voff to idx)
            state1 = ERR_STATE.BAD_TOK
          }
          break main_loop
        }
        // full match
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        break

      case 34:                                  // "    QUOTE
        state1 = states[state0|tok]
        idx = skip_str(src, idx + 1, lim, 34, 92)
        if (idx === -1) {
          // break for bad transition (state1 === 0) or for truncation, in that order.
          idx = lim
          if (state1 !== 0) { state0 = state1; state1 = ERR_STATE.TRUNCATED_TOK }
          break main_loop
        }
        idx++    // skip quote
        if (state1 === 0) { break main_loop }

        // key
        if ((state0 & 0x500) === 0) {     // (before|key) === 0
          koff = voff
          klim = idx
          state0 = state1
          continue
        }
        break

      case 48:case 49:case 50:case 51:case 52:   // digits 0-4
      case 53:case 54:case 55:case 56:case 57:   // digits 5-9
      case 45:                                   // '-'   ('+' is not legal here)
        state1 = states[state0|tok]
        tok = 78                                // N  Number
        while (all_num_chars[src[++idx]] === 1 && idx < lim) {}
        if (state1 === 0) { break main_loop }
        // the number *might* be truncated - flag it here and handle below
        if (idx === lim) { state0 = state1; state1 = ERR_STATE.TRUNCATED_TOK; break main_loop }
        break

      case 91:                                  // [    ARRAY START
      case 123:                                 // {    OBJECT START
        state1 = states[state0|tok]
        idx++
        if (state1 === 0) { break main_loop }
        stack.push(tok)
        break

      case 93:                                  // ]    ARRAY END
      case 125:                                 // }    OBJECT END
        state1 = states[state0|tok]
        idx++
        if (state1 === 0) { break main_loop }
        stack.pop()
        // state1 context is unset after closing brace (see state map).  we set it here.
        if (stack.length !== 0) { state1 |= (stack[stack.length - 1] === 91 ? in_arr : in_obj)}
        break

      default:
        state1 = ERR_STATE.UNEXPECTED_BYTE          // no legal transition for this token
        idx++
        break main_loop
    }

    // clean transition was made from state0 to state1
    cb_continue = cb(src, koff, klim, tok, voff, idx, null)
    state0 = state1
    if (cb_continue === true || cb_continue) {    // === check is faster (node 6)
      koff = -1
      klim = -1
      continue
    }
    break
  }  // end main_loop: while(idx < lim) {...

  // same return info is passed to callbacks and returned, - only differing state/err.
  var new_info = function (state, err) {
    return new Info(src, lim, koff, klim, tok, voff, idx, state, stack, err)
  }
  var info = null

  switch (state1) {
    //
    // error states
    //
    case 0:
      info = new_info(state0, ERR_STATE.UNEXPECTED_TOK)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR_STATE.UNEXPECTED_BYTE:
      info = new_info(state0, ERR_STATE.UNEXPECTED_BYTE)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR_STATE.BAD_TOK:
      info = new_info(state0, ERR_STATE.BAD_TOK)
      cb(src, koff, klim, TOK.ERR, voff, idx, info)
      break

    case ERR_STATE.TRUNCATED_TOK:
      if (tok === TOK.NUM && (state0 === (BEFORE|FIRST|VAL) || state0 === (AFTER|VAL))) {
        // numbers outside of object or array context are not considered truncated: '3.23' or '1, 2, 3'
        cb(src, koff, klim, tok, voff, idx, null)
        cb(src, -1, -1, TOK.END, idx, idx, null)
        info = null
      } else {
        info = new_info(state1, ERR_STATE.TRUNCATED_TOK)
        cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, voff, idx, info)
      }
      break

    //
    // complete end states
    //
    case BEFORE|FIRST|VAL:
    case AFTER|VAL:
      idx === lim || err('internal error - expected to reach src limit')
      cb(src, -1, -1, TOK.END, lim, lim, null)
      break

    //
    // incomplete end states (in object, in array, trailing comma...)
    //
    default:
      if (cb_continue) {
        // incomplete state was not caused of the callback halting process
        info = new_info(state1, ERR_STATE.TRUNCATED_SRC)
        cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, idx, idx, info)
      } else {
        // callback requested stop.  don't create end event or error, but do return state so parsing can be restarted.
        info = new_info(state1, ERR_STATE.NONE)
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
    var state = this.state
    var err = this.err
    if (state == null) { return 'undefined' }
    var ctx = (state & IN_ARR) ? 'in array' : (state & IN_OBJ) ? 'in object' : ''
    var pos = []
    pos.push(err === ERR_STATE.TRUNCATED_TOK ? 'inside' : (state & AFTER) ? 'after' : 'before')
    if (state & FIRST) { pos.push('first') }
    pos.push((state & VAL) ? 'value' : 'key')
    var ret = pos.join(' ')
    return ctx ? ctx + ', ' + ret : ret
  },
  toString: function () {
    var tok = this.tok
    var src = this.src
    var idx = this.idx
    var voff = this.voff
    var state = this.state

    var from = voff
    var thru = idx - 1
    var ret
    switch (this.err) {
      case ERR_STATE.BAD_TOK:
        ret = 'bad token ' + srcstr(src, voff, idx)
        break
      case ERR_STATE.TRUNCATED_TOK:
        ret = 'truncated ' + ((state & VAL) ? (tok === TOK.NUM ? 'number' : 'string') : 'key')
        break
      case ERR_STATE.UNEXPECTED_TOK:
        ret = 'unexpected token ' + srcstr(src, voff, idx) + ', ' + this.state_str()
        break
      case ERR_STATE.UNEXPECTED_BYTE:
        ret = 'unexpected byte ' + String(tok) + ', ' + this.state_str()
        from = this.idx - 1
        break
      case ERR_STATE.TRUNCATED_SRC:
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

function srcstr (src, off, lim) {
  var ret = ''
  for (var i=off; i<lim; i++) {
    var b = src[i]
    ret += (b > 31 && b < 127) ? String.fromCharCode(b) : '0x' + b.toString(16)
  }
  return ret
}

function err (msg ) { throw Error(msg) }

// a convenience function for summarizing/logging/debugging callback arguments
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

var ERR_STATE = {
  UNEXPECTED_TOK: -1,       // Same as default transition (zero). token is valid, but not expected
  UNEXPECTED_BYTE: -2,      // invalid byte - not a token
  TRUNCATED_TOK: -3,        // an individual value (string or number) is truncated by buffer limit
  TRUNCATED_SRC: -4,        // src is valid, but does not complete (in object, in array, trailing comma, ...)
  BAD_TOK: -5,              // initial byte(s) are legal, but has bad characters.  e.g. { "a": nulp }
  NONE: 0,                  // no error
}

var STATE = {
  IN_OBJ:      IN_OBJ,
  IN_ARR:      IN_ARR,

  BEFORE:      BEFORE,    // zero - for readability: BEFORE|FIRST|VAL etc.
  AFTER:       AFTER,     // bit, set is after, unset is before.

  FIRST:       FIRST,     // bit for value or key is first in an object or array

  KEY:         KEY,       // zero - for readability: AFTER|FIRST|KEY, etc.
  VAL:         VAL,       // bit, set means value, unset means key
}

module.exports = {
  tokenize: tokenize,
  args2str: args2str,
  TOK: TOK,
  STATE: STATE,
}
