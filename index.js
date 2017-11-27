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

function state_to_str (state) {
  if (state == null) { return 'undefined' }
  var ctx = (state & IN_ARR) ? 'in array' : (state & IN_OBJ) ? 'in object' : ''
  var pos = []
  pos.push((state & AFTER) ? 'after' : 'before')
  if (state & FIRST) { pos.push('first') }
  pos.push((state & VAL) ? 'value' : 'key')
  var ret = pos.join(' ')
  return ctx ? ctx + ', ' + ret : ret
}

function State (s) {
  this.state = s
}
State.prototype = {
  constructor: State,
  get ctx () {
    if (this.state == null) { return null }
    switch (this.state & CTX_MASK) {
      case IN_OBJ: return 'obj'
      case IN_ARR: return 'arr'
      default: return 'none'
    }
  },
  get pos () {
    if (this.state == null) { return null }
    return (this.state & AFTER) ? 'after' : 'before'
  },
  get first () {
    if (this.state == null) { return null }
    return !!(this.state & FIRST)
  },
  get key () {
    if (this.state == null) { return null }
    return !(this.state & VAL)
  },
  toString: function () {
    return state_to_str(this.state)
  }
}

// STATES   - LSB is reserved for token ascii value.  see readme
var CTX_MASK = 0x1800
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
  var max = 0x01FFF
  for (var i=0; i < max; i++) {
    ret[i] = 0
  }

  // map ( state0, tokens ) => state1
  var map = function (s0, chars, s1) {
    for (var i = 0; i < chars.length; i++) {
      ret[s0 | chars.charCodeAt(i)] = s1
    }
  }

  var val = '"ntf-0123456789' // all legal value start characters

  // start array
  map(        BEFORE|FIRST|VAL, '[', IN_ARR|BEFORE|FIRST|VAL )
  map( IN_ARR|BEFORE|FIRST|VAL, '[', IN_ARR|BEFORE|FIRST|VAL )
  map( IN_OBJ|BEFORE|FIRST|VAL, '[', IN_ARR|BEFORE|FIRST|VAL )
  map(        BEFORE|VAL,       '[', IN_ARR|BEFORE|FIRST|VAL )
  map( IN_ARR|BEFORE|VAL,       '[', IN_ARR|BEFORE|FIRST|VAL )
  map( IN_OBJ|BEFORE|VAL,       '[', IN_ARR|BEFORE|FIRST|VAL )

  // start object
  map(        BEFORE|FIRST|VAL, '{', IN_OBJ|BEFORE|FIRST|KEY )
  map( IN_ARR|BEFORE|FIRST|VAL, '{', IN_OBJ|BEFORE|FIRST|KEY )
  map( IN_OBJ|BEFORE|FIRST|VAL, '{', IN_OBJ|BEFORE|FIRST|KEY )
  map(        BEFORE|VAL,       '{', IN_OBJ|BEFORE|FIRST|KEY )
  map( IN_ARR|BEFORE|VAL,       '{', IN_OBJ|BEFORE|FIRST|KEY )
  map( IN_OBJ|BEFORE|VAL,       '{', IN_OBJ|BEFORE|FIRST|KEY )

  // values (no context)
  map( BEFORE|FIRST|VAL,        val, AFTER|VAL )
  map( AFTER|VAL,               ',', BEFORE|VAL )
  map( BEFORE|VAL,              val, AFTER|VAL )   // etc ...

  // array values
  map( IN_ARR|BEFORE|FIRST|VAL, val, IN_ARR|AFTER|VAL )
  map( IN_ARR|AFTER|VAL,        ',', IN_ARR|BEFORE|VAL )
  map( IN_ARR|BEFORE|VAL,       val, IN_ARR|AFTER|VAL )   // etc ...

  // object fields
  map( IN_OBJ|BEFORE|FIRST|KEY,  '"', IN_OBJ|AFTER|KEY )
  map( IN_OBJ|AFTER|KEY,         ':', IN_OBJ|BEFORE|VAL )
  map( IN_OBJ|BEFORE|VAL,        val, IN_OBJ|AFTER|VAL )
  map( IN_OBJ|AFTER|VAL,         ',', IN_OBJ|BEFORE|KEY )
  map( IN_OBJ|BEFORE|KEY,        '"', IN_OBJ|AFTER|KEY )  // etc ...

  // end array or object. context is not set here. it will be set by checking the stack
  map( IN_ARR|BEFORE|FIRST|VAL,  ']', AFTER|VAL )   // empty array
  map( IN_ARR|AFTER|VAL,         ']', AFTER|VAL )
  map( IN_OBJ|BEFORE|FIRST|KEY,  '}', AFTER|VAL )   // empty object
  map( IN_OBJ|AFTER|VAL,         '}', AFTER|VAL )

  return ret
}

var STATE_MAP = state_map()

function map_ascii (s, code) {
  var ret = []
  for (var i = 0; i < s.length; i++) { ret[s.charCodeAt(i)] = code }
  return ret
}

var WHITESPACE = map_ascii('\n\t\r ', 1)
var ALL_NUM_CHARS = map_ascii('-0123456789+.eE', 1)

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
                                      //    1. state1 === state0  (ok.  pending next transition)
                                      //    1. state1 === 0       (transition error - main_loop break)
                                      //    2. state1 !== state0  (truncation error - main_loop break)

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

      case 34:                                  // "    QUOTE
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        idx = skip_str(src, idx + 1, lim, 34, 92)
        if (idx === -1) { idx = lim; break main_loop }
        idx++    // skip quote

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
        if (state1 === 0) { break main_loop }
        tok = 78                                // N  Number
        while (all_num_chars[src[++idx]] === 1 && idx < lim) {}
        break

      case 91:                                  // [    ARRAY START
      case 123:                                 // {    OBJECT START
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        stack.push(tok)
        idx++
        break

      case 93:                                  // ]    ARRAY END
      case 125:                                 // }    OBJECT END
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        stack.pop()
        idx++
        // state1 context is unset after closing brace (see state map).  we set it here.
        if (stack.length !== 0) { state1 |= (stack[stack.length - 1] === 91 ? in_arr : in_obj)}
        break

      case 110:                                 // n    null
      case 116:                                 // t    true
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        idx += 4
        break

      case 102:                                 // f    false
        state1 = states[state0|tok]
        if (state1 === 0) { break main_loop }
        idx += 5
        break

      default:
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

  // same return info is returned (and passed to callbacks) in most of these cases (with different msg and state filled in)
  var ret = { msg: null, src: src, idx: idx, lim: lim, state: 0, tok: tok, stack: stack }

  if (state1 === 0) {
    // transition error
    var tokstr = (tok > 31 && tok < 127 && tok !== 34) ? '"' + String.fromCharCode(tok) + '"' : String(tok)
    ret.msg = 'unexpected character, ' + state_to_str(state0) + ', tok: ' + tokstr
    ret.state = state0
    cb(src, koff, klim, TOK.ERR, voff, idx, ret)
  } else if (state1 !== state0) {
    // truncation error
    ret.msg = 'truncated ' + (koff === -1 ? (tok === TOK.NUM ? 'number' : 'string') : 'key')
    ret.state = state1
    // info.tok indicates to token that failed to finish
    cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, voff, idx, ret)
  } else {
    // state1 === state0     transition / parsing is OK.
    ret.state = state1
    // info.tok has token that was used to transition into this state

    if (state0 !== (BEFORE|FIRST|VAL) && state0 !== (AFTER|VAL)) {
      // parsing ok, but incomplete (in object or array, trailing comma...)
      if (cb_continue) {
        ret.msg = 'unexpected end ' + state_to_str(state0)
        cb(src, koff, klim, opt.incremental ? TOK.END : TOK.ERR, idx, idx, ret)
      } else {
        ret.msg = 'client requested stop'
        // no callback
      }
    } else {
      // clean finish
      idx === lim || err('internal error - expected to reach src limit')
      cb(src, koff, klim, TOK.END, lim, lim, null)
      ret = null
    }
  }

  return ret
}

function err (msg ) { throw Error(msg) }

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
  state_to_str: state_to_str,
  state_to_obj: function (state) { return new State(state) },
  TOK: TOK,
  STATE: STATE,
}
