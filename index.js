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
var CTX = {
  // 0x0 means no context
  arr: 0x0100,
  obj: 0x0200,
}

var POS_MASK = 0x1C00
var POS = {
  bfk: 0x0400,
  b_k: 0x0800,
  bfv: 0x0C00,
  b_v: 0x1000,
  a_v: 0x1400,
  a_k: 0x1800,
}

// pos 'bfk', b_k'...
var POS_NAMES_BY_INT = Object.keys(POS).reduce(function (a,n) { a[POS[n]] = n; return a }, [])
function pos_str (pos, end_code) {
  var ret = []
  if (end_code !== END.TRUNC_VAL) { ret.push(pos[0] === 'b' ? 'before' : (pos[0] === 'a' ? 'after' : '?' )) }
  if (pos[1] === 'f') { ret.push('first') }
  ret.push(pos[2] === 'k' ? 'key' : (pos[2] === 'v' ? 'value' : '?'))
  return ret.join(' ')
}

var END = {
  UNEXP_VAL: 'UNEXP_VAL',       // token or value was recognized, but was not expected
  UNEXP_BYTE: 'UNEXP_BYTE',     // byte was not a recognized token or legal part of a value
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

var TOK2TCODE = (function (){
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

  var bfv = POS.bfv
  var b_v = POS.b_v
  var a_v = POS.a_v
  var bfk = POS.bfk
  var b_k = POS.b_k
  var a_k = POS.a_k
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

var WHITESPACE = ascii_to_code('\b\f\n\t\r ', 1)
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
      case END.TRUNC_VAL:
        restore_truncated(src, init, ret, cb)
        break
    }
  }
  ret.soff = init.soff || 0   // src offset
  ret.stack = init.stack || []
  ret.state = init.state || POS.bfv
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
  var after_key = POS.a_k
  var in_arr = CTX.arr
  var in_obj = CTX.obj
  var whitespace = WHITESPACE
  var all_num_chars = ALL_NUM_CHARS
  var tok_bytes = TOK_BYTES

  opt = opt || {}
  var init = restore(src, opt, cb)
  var koff = init.koff
  var klim = init.klim
  var state0 = init.state
  var stack = init.stack
  var off = opt.off || 0
  var lim = opt.lim == null ? src.length : opt.lim
  var idx = off
  var tok = 0           // current token/byte being handled
  var ecode = null
  var state1 = state0   // state1 possibilities are:
                        //    1. state1 = 0;                        unsupported transition
                        //    2. state1 > 0, state1 == state0;      OK, no pending callback
                        //    3. state1 > 0, state1 != state0;      OK, callback pending

  var voff = idx        // value start index
  var vcount = 0        // value count (number of complete values sent, such as str or num or end-obj, but beg-obj, beg-arr.

  // BEG and END signals are the only calls with zero length (voff === vlim)
  var cb_continue = cb(src, -1, -1, TOK.BEG, idx, idx)                      // 'B' - BEGIN parse
  if (cb_continue) {
    // breaking main_loop before idx == lim means we have an error
    main_loop: while (idx < lim) {
      voff = idx
      tok = src[idx]
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
          idx = skip_str(src, idx + 1, lim, 34, 92)
          if (idx === -1) { idx = lim; ecode = state1 === 0 ? END.UNEXP_VAL : END.TRUNC_VAL; break main_loop }
          idx++    // skip quote
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }

          // key
          if ((state1 & pos_mask) === after_key) {
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
    }  // end main_loop: while(idx < lim) {...
  }

  // check and clarify end state (before handling end state)
  if (ecode === null) {
    voff = idx    // no value
    if (state0 === POS.bfv || state0 === POS.a_v) {
      ecode = idx === lim ? END.DONE : END.CLEAN_STOP
    } else {
      ecode = END.TRUNC_SRC
    }
  } else if (ecode === END.UNEXP_VAL) {
    // non-delimiting bytes that follow a number are more clearly reported as unexpected byte instead of unexpected value
    // we backtrack here to check rather than check in the main_loop.
    var delim = ascii_to_code('{[]},:"', 1)
    if (
      voff > off
      && all_num_chars[src[voff-1]]
      && !delim[src[voff]]
      && !whitespace[src[voff]]
    ){
      ecode = END.UNEXP_BYTE
    }
  } else if (ecode === END.TRUNC_VAL) {
    if (idx === lim && tok === TOK.NUM && (state0 === POS.bfv || state0 === POS.b_v)) {
      // finished number outside of object or array context is considered done: '3.23' or '1, 2, 3'
      cb(src, koff, klim, tok, voff, idx, null)
      ecode = END.DONE
      voff = idx    // no value
    }
  }

  return handle_end({
    src: src,
    off: opt.off || 0,
    lim: lim,
    bytes: idx - off,
    vcount: vcount,
    state0: state0,
    ecode: ecode,
    stack: stack,
    koff: koff,
    klim: klim,
    tok: tok,
    voff: voff,
    vlim: idx,
    incremental: !!opt.incremental,
    cb: cb,
    cb_stopped: !cb_continue,
  })
}

function handle_end(p) {
  var tok_str = p.tok === TOK.NUM ? 'number' : (p.tok === TOK.STR ? 'string' : 'token')
  var val_str = esc_str(p.src, p.voff, p.vlim)
  var msg
  var etok

  switch (p.ecode) {
    case END.UNEXP_VAL:       // failed transition (state0 + tok => state1) === 0
      if (tok_str === 'token') { val_str = '"' + val_str + '"' }
      msg = 'unexpected ' + tok_str + ' ' + val_str
      etok = TOK.ERR
      break

    case END.UNEXP_BYTE:
      msg = 'unexpected byte ' + '"' + val_str + '"'
      etok = TOK.ERR
      break

    case END.TRUNC_VAL:
      msg = 'truncated ' + tok_str
      etok = p.incremental ? TOK.END : TOK.ERR
      break

    case END.TRUNC_SRC:
      msg = 'truncated input'
      etok = p.incremental ? TOK.END : TOK.ERR
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
      err('internal error, end state not handled: ' + p.ecode)
  }

  // make state info
  var trunc = p.ecode === END.TRUNC_VAL ? p.src.slice(p.voff, p.vlim) : null
  var stackstr = p.stack.map(function (b) { return String.fromCharCode(b) }).join('') || '-'
  var pos_name = POS_NAMES_BY_INT[p.state0 & POS_MASK]
  var tcode = TOK2TCODE[p.tok]
  var stateobj = new State(p.vcount, p.bytes, pos_name, stackstr, tcode, trunc)

  // enrich msg
  var context = stateobj.logical_context(p.ecode)
  var range = (p.voff >= p.vlim - 1) ? p.voff : p.voff + '..' + (p.vlim - 1)
  msg += ', ' + context + ' at ' + range

  // create info
  var info = {
    msg: msg,
    ecode: p.ecode,
    state: stateobj,
    src: p.src,
    koff: p.koff,
    klim: p.klim,
    tok: p.tok,
    voff: p.voff,
    vlim: p.vlim,
  }

  if (p.cb_stopped) { return info }   // skip callback if stop was requesteds
  p.cb(p.src, p.koff, p.klim, etok, p.voff, p.vlim, info)
  return info
}

function State (vcount, bytes, pos, stack, tcode, trunc) {
  this.vcount = vcount
  this.bytes = bytes
  this.stack = stack
  this.pos = pos
  this.type = tcode
  this.trunc = trunc    // truncated value src (if a value was incomplete)
}

State.prototype = {
  constructor: State,
  logical_context: function (ecode) {
    var ctx = this.in_arr() ? 'in array ' : (this.in_obj() ? 'in object ' : '')
    return ctx + pos_str(this.pos, ecode)
  },
  in_arr: function () { return this.stack[this.stack.length - 1] === '[' },
  in_obj: function () { return this.stack[this.stack.length - 1] === '{' },
  toString: function () {
    var truncstr = this.trunc ? this.type + this.trunc.length : '-'
    return this.vcount + '.' + this.bytes + '/' + this.stack + '/' + this.pos + '/' + truncstr
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
