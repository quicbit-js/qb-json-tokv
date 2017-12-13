// STATES   - LSB (0x7F) are reserved for token ascii value.
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
  TRUNC_SRC: 'TRUNC_SRC',       // stopped before stack was zero or with a pending value
  CLEAN_STOP: 'CLEAN_STOP',     // did not reach src lim, but stopped at a clean point (zero stack, no pending value)
  DONE: 'DONE',                 // parsed to src lim and state is clean (no stack, no pending value)
}

function pos_str (state, relative) {
  switch (state) {
    case OBJ_BFK: return relative ? 'before first key' : 'first key'
    case OBJ_B_K: return relative ? 'before key' : 'key'
    case OBJ_A_K: return relative ? 'after key' : 'key'
    case ARR_BFV: case OBJ_BFV: return relative ? 'before first value' : 'first value'
    case ARR_B_V: case OBJ_B_V: return relative ? 'before value' : 'value'
    case ARR_A_V: case OBJ_A_V: return relative ? 'after value' : 'value'
  }
}

function assign () {
  var ret = Object(arguments[0])
  for (var i = 1; i < arguments.length; i++) {
    var src = arguments[i]
    if (src != null) {
      Object.keys(src).forEach(function (k) { ret[k] = src[k] })
    }
  }
  return ret
}

function err (msg) { throw Error(msg) }

// Position represents parse position information - both logical and absolute (bytes).  Format (line and column) is
// not tracked by Position.
function Position (params) {
  assign(this, params)
}
Position.prototype = {
  constructor: Position,
  get in_arr () { return this.stack[this.stack.length - 1] === 91 },
  get in_obj () { return this.stack[this.stack.length - 1] === 123 },

  toString: function () {
    return str(this)
  }
}

function desc (pi, ecode) {
  var in_obj = pi.stack[pi.stack.length - 1] === 123
  var in_arr = pi.stack[pi.stack.length - 1] === 91
  var ctx = in_arr ? 'in array ' : (in_obj ? 'in object ' : '')
  return ctx + pos_str(pi.state, pi.ecode !== END.TRUNC_KEY && ecode !== END.TRUNC_VAL)
}

function parse_state (pi) {
  var in_obj = pi.stack[pi.stack.length - 1] === 123
  var ret = pi.stack.map(function (b) { return String.fromCharCode(b) }).join('')
  var vlen = pi.vlim - pi.voff

  var klen = 0
  var gap = 0
  if (pi.koff !== -1) {
    gap = pi.voff - pi.klim
    klen = pi.klim - pi.koff
  }

  if (pi.ecode === END.TRUNC_KEY) {
    ret += vlen   // only complete keyss are represented by koff..klim.  truncations and other errors are all at voff/vlim
  } else if (pi.ecode === END.TRUNC_VAL ) {
    if (in_obj) {
      if (pi.state === ARR_B_V) {
        ret += vlen
      } else if (pi.state === OBJ_B_V) {
        ret += klen + '.' + (gap - 1) + ':' + vlen
      } else {
        err('unexpected state for truncated value: ' + pi.state)
      }
    } else {
      ret += vlen
    }
  } else {
    switch (pi.state) {
      case ARR_BFV:
      case OBJ_BFK:
        ret += '-'
        break
      case ARR_B_V:
      case OBJ_B_K:
        ret += '+'
        break
      case ARR_A_V:
      case OBJ_A_V:
        ret += '.'
        break
      case OBJ_A_K:
        ret += klen + (gap > 0 ? '.' + gap : '') + '.'
        break
      case OBJ_B_V:
        ret += klen + (gap > 1 ? '.' + (gap - 1) : '') + ':'
        break
      default:
        err('state not handled: ' + pi.state)
    }
  }
  return ret
}

function str (pi) {
  var bytes = pi.vlim - pi.off
  var tbytes = pi.lim - pi.off
  return pi.vcount + '/' + bytes + ':' + tbytes + '/' + parse_state(pi)
}
module.exports = {
  str: str,
  desc: desc,
}
