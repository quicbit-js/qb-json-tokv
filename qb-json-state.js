
var jtok = require('.')

var END = jtok.END
var TOK = jtok.TOK

// STATES from jtok - not public, so just copied here (must keep in sync)
var ARR_BFV = 0x080
var ARR_B_V = 0x100
var ARR_A_V = 0x180
var OBJ_BFK = 0x200
var OBJ_B_K = 0x280
var OBJ_A_K = 0x300
var OBJ_BFV = 0x380
var OBJ_B_V = 0x400
var OBJ_A_V = 0x480

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

// a convenience function for summarizing/logging/debugging callback arguments as compact strings
// converts the 'arguments' array from cb into a terse string code.
function args2str () {
  var a = arguments[0]
  var i=0
// src, koff, klim, tok, voff, vlim, info
  var src = a[i++], koff = a[i++], klim = a[i++], tok = a[i++], voff = a[i++], vlim = a[i++], info = a[i++]
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
      ret = '!' + vlen + '@' + voff + ': ' + message(src, info)
      break
    default:
      ret = String.fromCharCode(tok) + '@' + voff
  }
  if (koff !== -1) {
    ret = 'K' + (klim - koff) + '@' + koff + ':' + ret
  }
  return ret
}

function esc_str (src, off, lim) {
  var ret = ''
  for (var i = off; i < lim; i++) {
    var b = src[i]
    ret += (b > 31 && b < 127) ? String.fromCharCode(b) : '\\u' + ("0000" + b.toString(16)).slice(-4)
  }
  return ret
}

// figure out end/error message and callback token
function message (src, info) {
  var pi = info.position
  var val_str = esc_str(src, pi.voff, pi.vlim)

  var tok_str = pi.tok === TOK.NUM ? 'number' : (pi.tok === TOK.STR ? 'string' : 'token')
  var ret

  switch (pi.ecode) {
    case END.UNEXP_VAL:       // failed transition (state0 + tok => state1) === 0
      if (tok_str === 'token') { val_str = '"' + val_str + '"' }
      ret = 'unexpected ' + tok_str + ' ' + val_str
      break
    case END.UNEXP_BYTE:
      ret = 'unexpected byte ' + '"' + val_str + '"'
      break
    case END.TRUNC_KEY:
      ret = 'truncated key'
      break
    case END.TRUNC_VAL:
      ret = 'truncated ' + tok_str
      break
    case END.TRUNC_SRC:
      ret = 'truncated input'
      break
    case END.CLEAN_STOP:
      ret = 'stopped early with clean state'
      break
    case END.DONE:
      ret = 'done'
      break
    default:
      err('internal error, end state not handled: ' + pi.ecode)
  }

  var range = (pi.voff >= pi.vlim - 1) ? pi.voff : pi.voff + '..' + (pi.vlim - 1)
  ret += ', ' + desc(pi, info.ecode) + ' at ' + range

  return ret
}

module.exports = {
  str: str,
  desc: desc,
  args2str: args2str,
}
