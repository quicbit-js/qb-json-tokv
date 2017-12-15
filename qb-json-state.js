
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

function desc (info) {
  var in_obj = info.stack[info.stack.length - 1] === 123
  var in_arr = info.stack[info.stack.length - 1] === 91
  var ctx = in_arr ? 'in array ' : (in_obj ? 'in object ' : '')
  return ctx + pos_str(info.state, info.ecode !== END.TRUNC_KEY && info.ecode !== END.TRUNC_VAL)
}

function parse_state (info) {
  var in_obj = info.stack[info.stack.length - 1] === 123
  var ret = info.stack.map(function (b) { return String.fromCharCode(b) }).join('')
  var vlen = info.vlim - info.voff

  var klen = 0
  var gap = 0
  if (info.koff !== -1) {
    gap = info.voff - info.klim
    klen = info.klim - info.koff
  }

  if (info.ecode === END.TRUNC_KEY) {
    ret += vlen   // only complete keyss are represented by koff..klim.  truncations and other errors are all at voff/vlim
  } else if (info.ecode === END.TRUNC_VAL ) {
    if (in_obj) {
      if (info.state === ARR_B_V) {
        ret += vlen
      } else if (info.state === OBJ_B_V) {
        ret += klen + '.' + (gap - 1) + ':' + vlen
      } else {
        err('unexpected state for truncated value: ' + info.state)
      }
    } else {
      ret += vlen
    }
  } else {
    switch (info.state) {
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
        err('state not handled: ' + info.state)
    }
  }
  return ret
}

function str (info) {
  var bytes = info.vlim - info.off
  var tbytes = info.lim - info.off
  return info.vcount + '/' + bytes + ':' + tbytes + '/' + parse_state(info)
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
      ret = '!' + vlen + '@' + voff + ': ' + message(info)
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
function message (ps) {
  var val_str = esc_str(ps.src, ps.voff, ps.vlim)

  var tok_str = ps.tok === TOK.NUM ? 'number' : (ps.tok === TOK.STR ? 'string' : 'token')
  var ret

  switch (ps.ecode) {
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
      err('internal error, end state not handled: ' + ps.ecode)
  }

  var range = (ps.voff >= ps.vlim - 1) ? ps.voff : ps.voff + '..' + (ps.vlim - 1)
  ret += ', ' + desc(ps) + ' at ' + range

  return ret
}

module.exports = {
  str: str,
  desc: desc,
  args2str: args2str,
}
