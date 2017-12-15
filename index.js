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
// BFK = before first key, B_K = before key, A_V = after value, ...
var ARR_BFV = 0x080
var ARR_B_V = 0x100
var ARR_A_V = 0x180
var OBJ_BFK = 0x200
var OBJ_B_K = 0x280
var OBJ_A_K = 0x300
var OBJ_BFV = 0x380
var OBJ_B_V = 0x400
var OBJ_A_V = 0x480

var END = {
  UNEXP_VAL: 'UNEXP_VAL',       // token or value was recognized, but was not expected
  UNEXP_BYTE: 'UNEXP_BYTE',     // byte was not a recognized token or legal part of a value
  TRUNC_KEY: 'TRUNC_KEY',       // stopped before an object key was finished
  TRUNC_VAL: 'TRUNC_VAL',       // stopped before a value was finished (number, false, true, null, string)
  TRUNC_SRC: 'TRUNC_SRC',       // stopped before done (stack.length > 0 or after comma)
  CLEAN_STOP: 'CLEAN_STOP',     // did not reach src lim, but stopped at a clean point (zero stack, no pending value)
  DONE: 'DONE',                 // parsed to src lim and state is clean (stack.lenght = 0, no pending value)
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
  BEG: 66,        // 'B'  - begin - about to process a buffer
  END: 69,        // 'E'  - end -   buffer limit reached and state is clean (stack is empty and no pending values)
  ERR: 0,         //  0   - error.  unexpected state.  check info for details.
}

// create an int-int map from (state + tok) -- to --> (new state)
function state_map () {
  var ret = []
  var max = 0x480 + 0x7F            // max state + max ascii
  for (var i = 0; i <= max; i++) {
    ret[i] = 0
  }

  // map ( [ctx], [state0], [ascii] ) => state1
  var map = function (s0_arr, chars, s1) {
    s0_arr.forEach(function (s0) {
      for (var i = 0; i < chars.length; i++) {
        ret[s0 | chars.charCodeAt(i)] = s1
      }
    })
  }

  var a_bfv = ARR_BFV
  var a_b_v = ARR_B_V
  var a_a_v = ARR_A_V
  var o_bfk = OBJ_BFK
  var o_b_k = OBJ_B_K
  var o_a_k = OBJ_A_K
  var o_bfv = OBJ_BFV
  var o_b_v = OBJ_B_V
  var o_a_v = OBJ_A_V

  var val = '"ntf-0123456789' // all legal value starts (ascii)

  // 0 = no context (comma separated values)
  // (s0 ctxs +       s0 positions + tokens) -> s1
  map([a_bfv, a_b_v], val, a_a_v)
  map([a_a_v], ',', a_b_v)

  map([a_bfv, a_b_v, o_bfv, o_b_v], '[',  a_bfv)
  map([a_bfv, a_b_v, o_bfv, o_b_v], '{',  o_bfk)

  map([o_a_v],            ',',  o_b_k)
  map([o_bfk, o_b_k],     '"',  o_a_k)
  map([o_a_k],            ':',  o_b_v)
  map([o_b_v],            val,  o_a_v)

  // ending of object and array '}' and ']' is handled in the code by checking the stack

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

  var ps = _tokenize(p, cb)
  if (ps.halted) {
    return [ps]
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
    state:    ARR_BFV,
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
  var obj_bfk = OBJ_BFK
  var obj_a_k = OBJ_A_K
  var obj_a_v = OBJ_A_V
  var arr_bfv = ARR_BFV
  var arr_a_v = ARR_A_V
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

  var in_obj =  stack[stack.length - 1] === 123
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
          if (state1 === obj_a_k) {
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
          in_obj = tok === 123
          state1 = states[state0 | tok]
          idx++
          if (state1 === 0) { ecode = END.UNEXP_VAL; break main_loop }
          stack.push(tok)
          break

        case 93:                                  // ]    ARRAY END
          in_obj = stack[stack.length - 2] === 123        // set before breaking loop
          idx++
          if ((state0 !== arr_bfv && state0 !== arr_a_v) || stack.pop() !== 91) { ecode = END.UNEXP_VAL; break main_loop }
          state1 = in_obj ? obj_a_v : arr_a_v
          vcount++
          break

        case 125:                                 // }    OBJECT END
          in_obj = stack[stack.length - 2] === 123        // set before breaking loop
          idx++
          if ((state0 !== obj_bfk && state0 !== obj_a_v) || stack.pop() !== 123) { ecode = END.UNEXP_VAL; break main_loop }
          state1 = in_obj ? obj_a_v : arr_a_v
          vcount++
          break

        default:
          idx++
          ecode = END.UNEXP_BYTE          // no legal transition for this token
          break main_loop
      }
      // clean transition was made from state0 to state1
      cb_continue = cb(src, koff, klim, tok, voff, idx, null)
      if (koff !== -1) {
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

  // parse state
  var ps = {
    src: src,
    off: off,
    lim: lim,
    vcount: vcount,
    koff: koff,
    klim: klim,
    tok: tok,
    voff: voff,
    vlim: idx,
    stack: stack,
    state: state0,
    ecode: ecode,
    halted: !cb_continue,
  }

  // check and clarify end state (before handling end state)
  clean_up_ecode(ps, cb)
  if (ps.ecode === null || ps.ecode === END.DONE || ps.ecode === END.CLEAN_STOP || ps.ecode === END.TRUNC_SRC) {
    ps.voff = idx    // wipe out phantom value
  }

  ps.etok = figure_etok(ps.ecode, opt.incremental)

  if (cb_continue) {
    cb(src, koff, klim, ps.etok, ps.voff, idx, ps)
  } // else callback was stopped - don't call

  if (ps.etok === TOK.ERR) {
    var err = new Error('error while parsing.  check error.info has the parse state details')
    err.info = ps
    throw err
  } else {
    return ps
  }
}

function figure_etok (ecode, incremental) {
  switch (ecode) {
    case END.UNEXP_VAL:
    case END.UNEXP_BYTE:
      return TOK.ERR
    case END.TRUNC_KEY:
    case END.TRUNC_VAL:
    case END.TRUNC_SRC:
      return incremental ? TOK.END : TOK.ERR
    case END.CLEAN_STOP:
    case END.DONE:
      return TOK.END
    default:
      err('internal error, end state not handled: ' + ecode)
  }
}

function clean_up_ecode (ps, cb) {
  var depth = ps.stack.length
  if (ps.ecode === null) {
    if (depth === 0 && (ps.state === ARR_BFV || ps.state === ARR_A_V)) {
      ps.ecode = ps.vlim === ps.lim ? END.DONE : END.CLEAN_STOP
    } else {
      ps.ecode = END.TRUNC_SRC
    }
  } else if (ps.ecode === END.UNEXP_VAL) {
    // tokens 'n', 't' and 'f' following a number are more clearly reported as unexpected byte instead of
    // token or value.  we backtrack here to check rather than check in the main_loop.
    var NON_DELIM = ascii_to_code('ntf', 1)
    if (
      ps.voff > ps.off
      && ALL_NUM_CHARS[ps.src[ps.voff-1]]
      && NON_DELIM[ps.src[ps.voff]]
    ){
      ps.ecode = END.UNEXP_BYTE
    }
  } else if (ps.ecode === END.TRUNC_VAL) {
    if (ps.state === OBJ_BFK || ps.state === OBJ_B_K) {
      ps.ecode = END.TRUNC_KEY
    } else if (ps.vlim === ps.lim && ps.tok === TOK.NUM && depth === 0 && (ps.state === ARR_BFV || ps.state === ARR_B_V)) {
      // finished number outside of object or array context is considered done: '3.23' or '1, 2, 3'
      // note - this means we won't be able to split no-context numbers outside of an array or object container.
      cb(ps.src, ps.koff, ps.klim, ps.tok, ps.voff, ps.vlim, null)
      ps.ecode = END.DONE

      ps.koff = -1
      ps.klim = -1
      ps.tok = TOK.END
      ps.voff = ps.vlim
      ps.state = ARR_A_V
    }
  }
}

module.exports = {
  tokenize: tokenize,
  TOK: TOK,
  END: END,
}
