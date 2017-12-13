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
// contexts (in array, in object, or none)
var CTX = {
  // 0x0 means no context
  arr: 0x0100,
  obj: 0x0200,
}

// relative positions.  before first key, after value, ...
var RPOS_MASK = 0x1C00
var RPOS = {
  bfk: 0x0400,
  b_k: 0x0800,
  bfv: 0x0C00,
  b_v: 0x1000,
  a_v: 0x1400,
  a_k: 0x1800,
}

// relative positions 'bfk', b_k'...
var RPOS_BY_INT = Object.keys(RPOS).reduce(function (a,n) { a[RPOS[n]] = n; return a }, [])

function pos_str (state, end_code) {
  var pstr = RPOS_BY_INT[state & RPOS_MASK]
  var ret = []
  if (end_code !== END.TRUNC_VAL && end_code !== END.TRUNC_KEY) { ret.push(pstr[0] === 'b' ? 'before' : (pstr[0] === 'a' ? 'after' : '?' )) }
  if (pstr[1] === 'f') { ret.push('first') }
  ret.push(pstr[2] === 'k' ? 'key' : (pstr[2] === 'v' ? 'value' : '?'))
  return ret.join(' ')
}

var END = {
  UNEXP_VAL: 'UNEXP_VAL',       // token or value was recognized, but was not expected
  UNEXP_BYTE: 'UNEXP_BYTE',     // byte was not a recognized token or legal part of a value
  TRUNC_KEY: 'TRUNC_KEY',       // stopped before an object key was finished
  TRUNC_VAL: 'TRUNC_VAL',       // stopped before a value was finished (number, false, true, null, string)
  TRUNC_SRC: 'TRUNC_SRC',       // stopped before stack was zero or with a pending value
  CLEAN_STOP: 'CLEAN_STOP',     // did not reach src lim, but stopped at a clean point (zero stack, no pending value)
  DONE: 'DONE',                 // parsed to src lim and state is clean (no stack, no pending value)
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
  STR: 34,        // '"'    // string
  TRU: 116,       // 't'
  NUM: 78,        // 'N'  - a number value starting with: -, 0, 1, ..., 9

  // special codes
  BEG: 66,        // 'B'  - begin - about to process
  END: 69,        // 'E'  - end -   buffer limit reached and state is clean (stack is empty and no pending values)
  ERR: 0,         //  0   - error.  unexpected state.  check info for details.
}

var TCODE_BY_TOK = (function (){
  var ret = []
  ret[TOK.NUM] = 'n'
  ret[TOK.STR] = 's'
  ret[TOK.TRU] = 'b'
  ret[TOK.FAL] = 'b'
  ret[TOK.NUL] = 'N'
  ret[TOK.obj] = 'o'
  ret[TOK.arr] = 'a'
  return ret
})()


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

  var bfv = RPOS.bfv
  var b_v = RPOS.b_v
  var a_v = RPOS.a_v
  var bfk = RPOS.bfk
  var b_k = RPOS.b_k
  var a_k = RPOS.a_k
  var arr = CTX.arr
  var obj = CTX.obj
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

  map([obj], [a_v], ',', obj | b_k)
  map([obj], [bfk, b_k], '"', obj | a_k)
  map([obj], [a_k], ':', obj | b_v)
  map([obj], [b_v], val, obj | a_v)

  map([arr], [bfv, a_v], ']', a_v)          // s1 context not set here. it is set by checking the stack
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

var WHITESPACE = ascii_to_code('\b\f\n\t\r ', 1)
var ALL_NUM_CHARS = ascii_to_code('-0123456789+.eE', 1)
var TOK_BYTES = ascii_to_bytes({ f: 'false', t: 'true', n: 'null' })

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

function concat (src1, off1, lim1, src2, off2, lim2) {
  var len1 = lim1 - off1
  var len2 = lim2 - off2
  var ret = new Uint8Array(len1 + len2)
  for (var i=0; i< len1; i++) { ret[i] = src1[i+off1] }
  for (i=0; i<len2; i++) { ret[i+len1] = src2[i+off2] }
  return ret
}

function err (msg) { throw Error(msg) }

// finish truncated key/value
// return array of result info for the one or two call(s) made (may have halted)
//
// prev has previous completion (src, koff, klim, position...) - use, don't modify.
// init has new src and defaults (koff = -1, klim = -1...) (to be modified)
function init_truncated (src, off, lim, prev, cb) {
  // find the value limit in src
  var vlim
  switch (prev.tok) {
    case TOK.STR:
      vlim = skip_str(src, off, lim)
      vlim >= 0 || err('could not complete truncated value')   // todo: handle incomplete truncated value
      break
    default:
      err('truncation not implemented')
  }

  var from_key = prev.koff !== -1
  var adj = from_key ? prev.koff : prev.voff
  var psrc = concat(prev.src, adj, prev.lim, src, off, vlim)
  var p = {
    src: psrc,
    off: 0,
    len: psrc.length,
    koff: from_key ? 0 : -1,
    klim: from_key ? prev.klim - adj : -1,
    tok: prev.tok,
    voff: prev.voff - adj,
    vlim: prev.vlim - adj,
    state: prev.position.state_code(),
    stack: prev.position.stack_codes(),
    vcount: 0
  }

  var info = _tokenize(p, cb)
  if (info.halted) {
    return [info]
  }
  var init = init_defaults(src.slice(vlim), 0, lim - vlim)
  init.state = STATE_MAP[p.state | prev.tok]        // state was checked
  init.stack = p.stack
  return init
}


// use values from opt (and opt.restore) to recover from truncated values, making
// use of _tokenize as needed to restore recover and return updated {src, opt} that
// will be used to continue processing.
//
// attempt to convert previous tokenize result into initial state.
function init_from_prev(src, off, lim, prev, cb) {
  // get vcount, stack, and state from position and ecode
  switch (prev.ecode) {
    case END.TRUNC_VAL:
      return init_truncated(src, off, lim, prev, cb)
      break
    default: err('restore for ' + p.ecode + ' not implemented')
  }
}

function init_defaults (src, off, lim) {
  return {
    src:      src,
    off:      off,    // current parse offset
    lim:      lim,

    koff:     -1,
    klim:     -1,
    tok:      0,
    voff:     off,

    stack:    [],
    state:    RPOS.bfv,
    vcount:   0,
  }
}
function tokenize (src, opt, cb) {
  // set init to
  opt = opt || {}
  var off = opt.off || 0
  var lim = opt.lim == null ? src.length : opt.lim
  var init = (opt && opt.prev)
    ? init_from_prev(src, off, lim, opt.prev, cb)
    : init_defaults(src, off, lim)
  return _tokenize(init, opt, cb)
}

function _tokenize (init, opt, cb) {
  // localized constants for faster access
  var states = STATE_MAP
  var rpos_mask = RPOS_MASK
  var after_key = RPOS.a_k
  var in_arr = CTX.arr
  var in_obj = CTX.obj
  var whitespace = WHITESPACE
  var all_num_chars = ALL_NUM_CHARS
  var tok_bytes = TOK_BYTES

  // localized init fo faster access
  var src =     init.src        // source buffer
  var off =     init.off        // starting offset
  var lim =     init.lim        // source limit (exclusive)

  var koff =    init.koff       // key offset
  var klim =    init.klim       // key limit (exclusive)
  var tok =     init.tok        // current token/byte being handled
  var voff =    init.voff       // value start index

  var stack =   init.stack      // ascii codes 91 and 123 for array / object depth
  var state0 =  init.state      // container context and relative position encoded as an int
  var vcount =  init.vcount     // number of complete values parsed, such as STR, NUM or OBJ_END, but not counting OBJ_BEG or ARR_BEG.

  var idx =    off              // current source offset
  var ecode =   null            // end code (not necessarily an error - depends on settings)
  var state1 = state0   // state1 possibilities are:
                        //    1. state1 = 0;                        unsupported transition
                        //    2. state1 > 0, state1 == state0;      OK, no pending callback
                        //    3. state1 > 0, state1 != state0;      OK, callback pending

  // BEG and END signals are the only calls with zero length (where voff === vlim)
  var cb_continue = cb(src, -1, -1, TOK.BEG, idx, idx)                      // 'B' - BEGIN parse
  if (cb_continue) {
    // breaking main_loop before vlim == lim means callback returned falsey or we have an error
    main_loop: while (idx < lim) {
      voff = idx
      tok = src[voff]
      switch (tok) {
        case 8: case 9: case 10: case 12: case 13: case 32:
          if (whitespace[src[++idx]] && idx < lim) {
            while (whitespace[src[++idx]] === 1 && idx < lim) {}
          }
          continue

        // placing (somewhat redundant) logic below this point allows fast skip of whitespace (above)

        case 44:                                  // ,    COMMA
        case 58:                                  // :    COLON
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }
          state0 = state1
          continue

        case 102:                                 // f    false
        case 110:                                 // n    null
        case 116:                                 // t    true
          idx = skip_bytes(src, idx, lim, tok_bytes[tok])
          state1 = states[state0 | tok]
          if (idx <= 0) { idx = -idx; ecode = state1 === 0 ? END.UNEXP_VAL : END.TRUNC_VAL; break main_loop }
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }
          vcount++
          break

        case 34:                                  // "    QUOTE
          state1 = states[state0 | tok]
          idx = skip_str(src, idx + 1, lim)
          if (idx === -1) { idx = lim; ecode = state1 === 0 ? END.UNEXP_VAL : END.TRUNC_VAL; break main_loop }
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }

          // key
          if ((state1 & rpos_mask) === after_key) {
            koff = voff
            klim = idx
            state0 = state1
            continue
          }
          vcount++
          break

        case 48:case 49:case 50:case 51:case 52:   // digits 0-4
        case 53:case 54:case 55:case 56:case 57:   /* digits 5-9 */
        case 45:                                   // '-'   ('+' is not legal here)
          state1 = states[state0 | tok]
          tok = 78                                // N  Number
          while (all_num_chars[src[++idx]] === 1 && idx < lim) {}
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }
          if (idx === lim) { ecode = END.TRUNC_VAL; break main_loop }  // *might* be truncated - flag it here and handle below
          vcount++
          break

        case 91:                                  // [    ARRAY START
        case 123:                                 // {    OBJECT START
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }
          stack.push(tok)
          break

        case 93:                                  // ]    ARRAY END
        case 125:                                 // }    OBJECT END
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }
          stack.pop()
          // state1 context is unset after closing brace (see state map).  we set it here.
          if (stack.length !== 0) { state1 |= (stack[stack.length - 1] === 91 ? in_arr : in_obj) }
          vcount++
          break

        default:
          idx++
          ecode = END.UNEXP_BYTE          // no legal transition for this token
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
    }  // end main_loop: while(vlim < lim) {...
  }

  // check and clarify end state (before handling end state)
  ecode = clean_up_ecode(src, off, lim, koff, klim, tok, voff, idx, state0, ecode, cb)
  if (ecode === null || ecode === END.DONE || ecode === END.CLEAN_STOP || ecode === END.TRUNC_SRC) {
    voff = idx    // wipe out phantom value
  }

  var info = {
    msg: null,
    halted: !cb_continue,
    ecode: ecode,
    src: src,           // src, koff, klim... hold the key and value bytes that can be used to recover from truncation.
    position: new Position(
      off,
      lim,
      vcount,
      koff,
      klim,
      tok,
      voff,
      idx,
      stack,
      state0,
      ecode
    ),
  }

  var val_str = esc_str(info.src, voff, idx)
  var range = (voff >= idx - 1) ? voff : voff + '..' + (idx - 1)
  var msg_tok = figure_msg_etok(info, tok, val_str, range, opt.incremental)
  info.msg = msg_tok.msg

  if (cb_continue) {
    cb(src, koff, klim, msg_tok.etok, voff, idx, info)
  } // else callback was stopped - don't call

  if (msg_tok.etok === TOK.ERR) {
    var err = new Error(info.msg + ' (error.info has details)')
    err.info = info
    throw err
  } else {
    return info
  }
}

function clean_up_ecode (src, off, lim, koff, klim, tok, voff, vlim, state0, ecode, cb) {
  // var rpos = state0 & RPOS_MASK
  if (ecode === null) {
    if (state0 === RPOS.bfv || state0 === RPOS.a_v) {
      ecode = vlim === lim ? END.DONE : END.CLEAN_STOP
    } else {
      ecode = END.TRUNC_SRC
    }
  } else if (ecode === END.UNEXP_VAL) {
    // tokens 'n', 't' and 'f' following a number are more clearly reported as unexpected byte instead of
    // token or value.  we backtrack here to check rather than check in the main_loop.
    var NON_DELIM = ascii_to_code('ntf', 1)
    if (
      voff > off
      && ALL_NUM_CHARS[src[voff-1]]
      && NON_DELIM[src[voff]]
    ){
      ecode = END.UNEXP_BYTE
    }
  } else if (ecode === END.TRUNC_VAL) {
    var rpos = state0 & RPOS_MASK
    if (rpos === RPOS.bfk || rpos === RPOS.b_k) {
      ecode = END.TRUNC_KEY
    } else if (vlim === lim && tok === TOK.NUM && (state0 === RPOS.bfv || state0 === RPOS.b_v)) {
      // finished number outside of object or array context is considered done: '3.23' or '1, 2, 3'
      // note - this means we won't be able to split no-context numbers outside of an array or object container.
      cb(src, koff, klim, tok, voff, vlim, null)
      ecode = END.DONE
    }
  }
  return ecode
}

// figure out end/error message and callback token
function figure_msg_etok (info, tok, val_str, range, incremental) {
  var tok_str = tok === TOK.NUM ? 'number' : (tok === TOK.STR ? 'string' : 'token')
  var msg
  var etok

  switch (info.ecode) {
    case END.UNEXP_VAL:       // failed transition (state0 + tok => state1) === 0
      if (tok_str === 'token') { val_str = '"' + val_str + '"' }
      msg = 'unexpected ' + tok_str + ' ' + val_str
      etok = TOK.ERR
      break
    case END.UNEXP_BYTE:
      msg = 'unexpected byte ' + '"' + val_str + '"'
      etok = TOK.ERR
      break
    case END.TRUNC_KEY:
      msg = 'truncated key'
      etok = incremental ? TOK.END : TOK.ERR
      break
    case END.TRUNC_VAL:
      msg = 'truncated ' + tok_str
      etok = incremental ? TOK.END : TOK.ERR
      break
    case END.TRUNC_SRC:
      msg = 'truncated input'
      etok = incremental ? TOK.END : TOK.ERR
      break
    case END.CLEAN_STOP:
      msg = 'stopped early with clean state'
      etok = TOK.END
      break
    case END.DONE:
      msg = 'done'
      etok = TOK.END
      break
    default:
      err('internal error, end state not handled: ' + info.ecode)
  }

  // enrich msg
  var pos = info.position.description(info.ecode)
  msg += ', ' + pos + ' at ' + range

  return { msg: msg, etok: etok }
}

// Position represents parse position information - both logical and absolute (bytes).  Format (line and column) is
// not tracked by Position.
function Position (off, lim, vcount, koff, klim, tok, voff, vlim, stack, state, ecode) {
  this.off = off
  this.lim = lim
  this.vcount = vcount
  this.koff = koff
  this.klim = klim
  this.tok = tok
  this.voff = voff
  this.vlim = vlim
  this.stack = stack
  this.state = state
  this.ecode = ecode
}

Position.prototype = {
  constructor: Position,
  description: function (ecode) {
    var ctx = this.in_arr ? 'in array ' : (this.in_obj ? 'in object ' : '')
    return ctx + pos_str(this.state, ecode)
  },
  get in_arr () { return this.stack[this.stack.length - 1] === 91 },
  get in_obj () { return this.stack[this.stack.length - 1] === 123 },
  get parse_state () {
    var rpos = this.state & RPOS_MASK
    var ret = this.stack.map(function (b) { return String.fromCharCode(b) }).join('')
    var in_obj = this.in_obj
    var vlen = this.vlim - this.voff

    var klen = 0
    var gap = 0
    if (this.koff !== -1) {
      gap = this.voff - this.klim
      klen = this.klim - this.koff
    }

    if (this.ecode === END.TRUNC_KEY) {
      ret += vlen   // only complete keys are represented by koff/klim.  truncations and other errors are all at voff/vlim
    } else if (this.ecode === END.TRUNC_VAL ) {
      if (in_obj) {
        switch (rpos) {
          case RPOS.bfk: case RPOS.b_k:
            err('this should not happen')
            // ret += klen + (gap - 1)
            break
          case RPOS.b_v:
            ret += klen + '.' + (gap - 1) + ':' + vlen
            break
          default:
            err('unexpected state for truncated value: ' + rpos)
        }
      } else {
        ret += vlen
      }
    } else {
      switch (rpos) {
        case RPOS.bfv:
        case RPOS.bfk:
          ret += '-'
          break
        case RPOS.b_k:
          ret += '+'
          break
        case RPOS.a_v:
          ret += '.'
          break
        case RPOS.a_k:
          ret += klen + (gap > 0 ? '.' + gap : '') + '.'
          break
        case RPOS.b_v:
          ret += in_obj ? (klen + (gap > 1 ? '.' + (gap - 1) : '') + ':') : '+'
          break
        default:
          err('state not handled')
      }
    }
    return ret
  },
  toString: function () {
    var bytes = this.vlim - this.off
    var tbytes = this.lim - this.off
    return this.vcount + '/' + bytes + ':' + tbytes + '/' + this.parse_state
  }
}

function esc_str (src, off, lim) {
  var ret = ''
  for (var i = off; i < lim; i++) {
    var b = src[i]
    ret += (b > 31 && b < 127) ? String.fromCharCode(b) : '\\u' + ("0000" + b.toString(16)).slice(-4)
  }
  return ret
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
    case TOK.END:
      ret = 'E' + (vlen || '') + '@' + voff
      break
    case TOK.ERR:
      ret = '!' + vlen + '@' + voff + ': ' + info.msg
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
}
