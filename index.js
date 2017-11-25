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
  var ctx = ''
  switch (state & CTX_MASK) {
    case CTX_OBJ: ctx = 'in object'; break
    case CTX_ARR: ctx = 'in array'; break
  }

  var pos = []
  switch (state & POS_MASK) {
    case BEFORE: pos.push('before'); break
    case AFTER: pos.push('after'); break
    case INSIDE: pos.push('inside'); break
  }
  if (state & FIRST) { pos.push('first') }
  pos.push((state & KEY) ? 'key' : 'value')

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
      case CTX_OBJ: return 'obj'
      case CTX_ARR: return 'arr'
      case CTX_NONE: return 'none'
      default: return 'undefined'
    }
  },
  get pos () {
    if (this.state == null) { return null }
    switch (this.state & POS_MASK) {
      case BEFORE: return 'before'
      case AFTER: return 'after'
      case INSIDE: return 'inside'
      default: return 'undefined'
    }
  },
  get first () {
    if (this.state == null) { return null }
    return !!(this.state & FIRST)
  },
  get key () {
    if (this.state == null) { return null }
    return !!(this.state & KEY)
  },
  toString: function () {
    return state_to_str(this.state)
  }
}

// STATES   - LSB is reserved for token ascii value.  see readme
var CTX_MASK =    0x0300
var CTX_OBJ =     0x0100
var CTX_ARR =     0x0200
var CTX_NONE =    0x0300

var POS_MASK =    0x0C00
var BEFORE =      0x0400
var AFTER =       0x0800
var INSIDE =      0x0C00

var KEYVAL_MASK = 0x1000
var VAL =         0x0000
var KEY =         0x1000

var FIRST =       0x2000     // is first value in an object or array

// create an int-int map from (state + tok) -- to --> (new state)
function state_map () {
  var ret = []
  var max = CTX_NONE|INSIDE|KEY|FIRST|255   // max value
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
  map( CTX_NONE | BEFORE|FIRST|VAL, '[',  CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_ARR  | BEFORE|FIRST|VAL, '[',  CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_OBJ  | BEFORE|FIRST|VAL, '[',  CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_NONE | BEFORE|VAL,       '[',  CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_ARR  | BEFORE|VAL,       '[',  CTX_ARR | BEFORE|FIRST|VAL )
  map( CTX_OBJ  | BEFORE|VAL,       '[',  CTX_ARR | BEFORE|FIRST|VAL )

  // start object
  map( CTX_NONE | BEFORE|FIRST|VAL, '{',  CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_ARR  | BEFORE|FIRST|VAL, '{',  CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_OBJ  | BEFORE|FIRST|VAL, '{',  CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_NONE | BEFORE|VAL,       '{',  CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_ARR  | BEFORE|VAL,       '{',  CTX_OBJ | BEFORE|FIRST|KEY )
  map( CTX_OBJ  | BEFORE|VAL,       '{',  CTX_OBJ | BEFORE|FIRST|KEY )

  // values (no context)
  map( CTX_NONE | BEFORE|FIRST|VAL, val,  CTX_NONE | AFTER|VAL )
  map( CTX_NONE | AFTER|VAL,        ',',  CTX_NONE | BEFORE|VAL )
  map( CTX_NONE | BEFORE|VAL,       val,  CTX_NONE | AFTER|VAL )   // etc ...

  // array values
  map( CTX_ARR | BEFORE|FIRST|VAL,  val,  CTX_ARR | AFTER|VAL )
  map( CTX_ARR | AFTER|VAL,         ',',  CTX_ARR | BEFORE|VAL )
  map( CTX_ARR | BEFORE|VAL,        val,  CTX_ARR | AFTER|VAL )   // etc ...

  // object fields
  map( CTX_OBJ | BEFORE|FIRST|KEY,  '"',  CTX_OBJ | AFTER|KEY )
  map( CTX_OBJ | AFTER|KEY,         ':',  CTX_OBJ | BEFORE|VAL )
  map( CTX_OBJ | BEFORE|VAL,        val,  CTX_OBJ | AFTER|VAL )
  map( CTX_OBJ | AFTER|VAL,         ',',  CTX_OBJ | BEFORE|KEY )
  map( CTX_OBJ | BEFORE|KEY,        '"',  CTX_OBJ | AFTER|KEY )  // etc ...

  // end array or object. context is not set here. it will be set by checking the stack
  map( CTX_ARR | BEFORE|FIRST|VAL,  ']',  AFTER|VAL )   // empty array
  map( CTX_ARR | AFTER|VAL,         ']',  AFTER|VAL )
  map( CTX_OBJ | BEFORE|FIRST|KEY,  '}',  AFTER|VAL )   // empty object
  map( CTX_OBJ | AFTER|VAL,         '}',  AFTER|VAL )

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

function info_for_unexpected (state, tok, stack) {
  var tokstr = (tok > 31 && tok < 127 && tok !== 34) ? '"' + String.fromCharCode(tok) + '"' : String(tok)
  var msg = 'unexpected character, ' + state_to_str(state) + ', tok: ' + tokstr
  return {msg: msg, state: state, tok: tok, stack: stack}
}

function info_for_unfinished (koff, state, tok, stack) {
  var msg
  if ((state & POS_MASK) === INSIDE) {
    msg = 'truncated ' + (tok === TOK.NUM ? 'number' : (koff === -1 ? 'string' : 'key'))
  } else {
    msg = 'unfinished ' + (stack[stack.length-1] === TOK.ARR_BEG ? 'array' : 'object')
  }
  return {msg: msg, state: state, tok: tok, stack: stack}
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

function tokenize (src, cb, opt) {
  opt = opt || {}
  var rst = opt.restore || {}
  var off = opt.off || 0
  var lim = opt.lim == null ? src.length : opt.lim

  var states = STATE_MAP
  var inside = INSIDE
  var ctx_mask = CTX_MASK
  var ctx_none = CTX_NONE
  var ctx_arr = CTX_ARR
  var ctx_obj = CTX_OBJ
  var pos_mask = POS_MASK
  var keyval_mask = KEYVAL_MASK
  var before = BEFORE
  var key = KEY
  var whitespace = WHITESPACE
  var all_num_chars = ALL_NUM_CHARS

  var idx = off                     // current index offset into buf
  var koff = -1                     // key start index
  var klim = -1                     // key limit index
  var voff = -1                     // value start index
  var state0 = rst.state || ctx_none|before|FIRST|VAL  // state we are transitioning from. see state_map()
  var state1 = 0                    // new state to transition into
  var stack = rst.stack || []       // collection of array and object open braces (for checking matched braces)
  var tok = rst.tok || -1           // current token/byte being handled
  var errstate = 0                  // error state - if set, then an error will be sent
  var cbres = -1                    // callback result (integer indicating stop, continue or jump to new index)

  // note that BEG and END are the only token values with zero length (voff === vlim)
  cb(src, -1, -1, TOK.BEG, off, off)                      // 'B' - BEGIN

  while (idx < lim) {
    voff = idx
    tok = src[idx++]
    switch (tok) {
      case 9: case 10: case 13: case 32:
        if (whitespace[src[idx]] && idx < lim) {
          while (whitespace[src[++idx]] === 1 && idx < lim) {}
        }
        voff = idx
        continue

      // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

      case 44:                                  // ,    COMMA
      case 58:                                  // :    COLON
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        state0 = state1
        voff = idx
        continue

      case 34:                                  // "    QUOTE
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        idx = skip_str(src, idx, lim, 34, 92)
        if (idx === -1) { idx = lim; errstate = state0|inside; continue }
        idx++    // skip quote

        // key
        if ((state0 & (pos_mask|keyval_mask)) === (before|key)) {
          koff = voff
          klim = idx
          voff = idx
          state0 = state1
          continue
        }
        break

      case 48:case 49:case 50:case 51:case 52:   // digits 0-4
      case 53:case 54:case 55:case 56:case 57:   // digits 5-9
      case 45:                                   // '-'   ('+' is not legal here)
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        tok = TOK.NUM                                 // N  Number
        while (all_num_chars[src[idx]] === 1 && idx < lim) {idx++}
        if (idx === lim && (state0 & ctx_mask) !== ctx_none) { errstate = state0|inside; continue }
        break

      case 91:                                  // [    ARRAY START
      case 123:                                 // {    OBJECT START
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        stack.push(tok)
        break

      case 93:                                  // ]    ARRAY END
      case 125:                                 // }    OBJECT END
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        stack.pop()
        state1 |= stack.length === 0 ? ctx_none : (stack[stack.length - 1] === 91 ? ctx_arr : ctx_obj)
        break

      case 110:                                 // n    DMSG
      case 116:                                 // t    true
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        idx += 3 // added 1 above
        break

      case 102:                                 // f    false
        state1 = states[state0|tok]
        if (state1 === 0) { errstate = state0; break }
        idx += 4  // added 1 above
        break

      default:
        errstate = state0
    }

    if (errstate !== 0) {
      // errors for which idx !== lim (all except string and number truncation)
      cbres = cb(src, koff, klim, 0, voff, idx, info_for_unexpected(errstate, tok, stack))
    } else {
      state0 = state1
      cbres = cb(src, koff, klim, tok, voff, idx, null)
    }
    if (cbres === 0) {
      break
    }
    if (cbres > 0) {
      idx = cbres
    }
    koff = -1
    klim = -1
    errstate = 0
  }  // end main_loop: while(idx < lim) {...

  if (errstate === 0 && (state0 === (CTX_NONE|BEFORE|FIRST|VAL) || state0 === (CTX_NONE|AFTER|VAL))) {
    // clean finish
    if (cbres !== 0 && idx >= lim) {
      cb(src, -1, -1, TOK.END, lim, lim, null)
    }
    return null
  }
  // unclean finish - a truncation from reaching lim or from client request (zero)
  var state = errstate || state0
  if (opt.incremental) {
    //  caller requested increment information, truncation is not an error
    var end_info = { src: src, off: off, lim: lim, koff: koff, klim: klim, idx: idx, state: state, tok: tok, stack: stack }
    cb(src, koff, klim, TOK.END, idx, idx, end_info)
    return end_info
  } else {
    // call did not request increment information, report trunction error and end
    if (cbres !== 0) {
      cbres = cb(src, koff, klim, 0, voff, idx, info_for_unfinished(koff, state, tok, stack))
      if (idx >= lim && cbres !== 0) {
        cb(src, -1, -1, TOK.END, lim, lim, null)
      }
    } // else, client requested stop without incremental info - don't report
    return null
  }
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

var STATE = {
  CTX_MASK:    CTX_MASK,
  CTX_OBJ:     CTX_OBJ,
  CTX_ARR:     CTX_ARR,
  CTX_NONE:    CTX_NONE,

  POS_MASK:    POS_MASK,
  BEFORE:      BEFORE,
  AFTER:       AFTER,
  INSIDE:      INSIDE,

  KEYVAL_MASK: KEYVAL_MASK,
  VAL:         VAL,
  KEY:         KEY,
                      
  FIRST:       FIRST,     // means value or key/value is first in an object or array
}

module.exports = {
  tokenize: tokenize,
  state_to_str: state_to_str,
  state_to_obj: function (state) { return new State(state) },
  TOK: TOK,
  STATE: STATE,
}
