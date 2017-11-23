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

  // map ( state0, tokens, state1)
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

var STATES = state_map()

function map_ascii (s, code) {
  var ret = []
  for (var i = 0; i < s.length; i++) { ret[s.charCodeAt(i)] = code }
  return ret
}

var WHITESPACE = map_ascii('\n\t\r ', 1)
var ALL_NUM_CHARS = map_ascii('-0123456789+.eE', 1)

function inf (msg, state, tok) {
  return {msg: msg, state: state, tok: tok}
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

var UNC = 'unexpected character'  // default error message, used for most errors

function tokenize (cb, src, off, lim, opt) {
  opt = opt || {}
  off = off || 0
  lim = lim == null ? src.length : lim

  var idx = off                     // current index offset into buf
  var koff = -1
  var klim = -1
  var voff = -1                     // value start index
  var info = null                   // extra information about errors or split values
  var state0 = opt.state || CTX_NONE|BEFORE|FIRST|VAL  // state we are transitioning from. see state_map()
  var state1 = 0                    // new state
  var stack = opt.stack || []       // collection of array and object open braces (for checking matched braces)
  var tok = -1                      // current token/byte being handled

  cb(src, -1, -1, TOK.BEG, off, off)                      // 'B' - BEGIN

  while (idx < lim) {
    info = null
    voff = idx
    tok = src[idx++]
    switch (tok) {
      case 9: case 10: case 13: case 32:
        if (WHITESPACE[src[idx]] && idx < lim) {
          while (WHITESPACE[src[++idx]] === 1 && idx < lim) {}
        }
        voff = -1
        continue

      // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

      case 44:                                  // ,    COMMA
      case 58:                                  // :    COLON
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        state0 = state1
        voff = -1
        continue

      case 34:                                  // "    QUOTE
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        idx = skip_str(src, idx, lim, 34, 92)
        if (idx === -1) { idx = lim; info = inf('unterminated string', state0|INSIDE, tok); tok = 0; break }
        idx++       // move past end quote

        if ((state0 & (POS_MASK | KEYVAL_MASK)) === (BEFORE | KEY)) {   // ignore FIRST bit
          koff = voff
          klim = idx
          voff = -1                   // indicate no value
        }
        state0 = state1
        break

      case 91:                                  // [    ARRAY START
      case 123:                                 // {    OBJECT START
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        stack.push(tok)
        state0 = state1
        break

      case 93:                                  // ]    ARRAY END
      case 125:                                 // }    OBJECT END
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        stack.pop()
        state1 |= stack.length === 0 ? CTX_NONE : (stack[stack.length - 1] === 91 ? CTX_ARR : CTX_OBJ)
        state0 = state1
        break

      case 110:                                 // n    DMSG
      case 116:                                 // t    true
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        idx += 3 // added 1 above
        state0 = state1
        break

      case 102:                                 // f    false
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        idx += 4  // added 1 above
        state0 = state1
        break

      case 48:case 49:case 50:case 51:case 52:   // digits 0-4
      case 53:case 54:case 55:case 56:case 57:   // digits 5-9
      case 45:                                   // '-'   ('+' is not legal here)
        state1 = STATES[state0|tok]
        if (!state1) { info = inf(UNC, state0, tok); tok = 0; break }
        tok = TOK.NUM                                 // N  Number
        while (ALL_NUM_CHARS[src[idx]] === 1 && idx < lim) {idx++}
        if (idx === lim && (state0 & CTX_MASK) !== CTX_NONE) { info = inf('unterminated number', state0|INSIDE, tok); tok = 0; break }
        state0 = state1
        break

      default:
        info = inf(UNC, state0, tok); tok = 0
    }

    if (voff !== -1) {
      var cbres = cb(src, koff, klim, tok, voff, idx, info)
      koff = -1
      klim = -1
      if (cbres > 0) {
        idx = cbres
      } else if (cbres === 0) {
        return                                                        // cb requested stop
      }
    }
  }  // end main_loop: while(idx < lim) {...

  if (koff !== -1) {
    info = inf('incomplete key-value pair', state0, tok); tok = 0
    cb(src, koff, klim, tok, lim, lim, info)           // push out pending key
  }

  cb(src, -1, -1, TOK.END, idx, idx)        // END
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

module.exports = {
  tokenize: tokenize,
  state_to_str: state_to_str,
  state_to_obj: function (state) { return new State(state) },
  TOK: TOK,
}
