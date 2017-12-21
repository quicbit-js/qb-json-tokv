
var jtok = require('.')

var TOK = jtok.TOK

// position codes from jtok - not public, so copied here (must keep in sync with qb-json-tokv)
var ARR_BFV = 0x080
var ARR_B_V = 0x100
var ARR_A_V = 0x180
var OBJ_BFK = 0x200
var OBJ_B_K = 0x280
var OBJ_A_K = 0x300
var OBJ_B_V = 0x380
var OBJ_A_V = 0x400

function pos_str (pos, relative) {
  switch (pos) {
    case ARR_BFV: return relative ? 'before first value' : 'first value'
    case OBJ_BFK: return relative ? 'before first key' : 'first key'
    case ARR_B_V: case OBJ_B_V: return relative ? 'before value' : 'value'
    case ARR_A_V: case OBJ_A_V: return relative ? 'after value' : 'value'
    case OBJ_B_K: return relative ? 'before key' : 'key'
    case OBJ_A_K: return relative ? 'after key' : 'key'
  }
}

function err (msg) { throw Error(msg) }

function within_value (ps) {
  return ps.vlim !== ps.voff && (ps.tok === TOK.LIM || ps.tok === TOK.BAD_BYT)
}

function desc (ps) {
  var in_obj = ps.stack[ps.stack.length - 1] === 123
  var in_arr = ps.stack[ps.stack.length - 1] === 91
  var ctx = in_arr ? 'in array ' : (in_obj ? 'in object ' : '')
  return ctx + pos_str(ps.pos, !within_value(ps))
}

function parse_state (ps) {
  // var in_obj = ps.stack[ps.stack.length - 1] === 123
  var stack = ps.stack.map(function (b) { return String.fromCharCode(b) }).join('')
  var klen = ps.klim - ps.koff
  var gap = ps.voff - ps.klim
  var vlen = ps.vlim - ps.voff

  var keyval = ''
  if (klen) {
    keyval += klen
    if (ps.pos === OBJ_B_V) { gap-- }   // don't include colon
    if (gap > 0) { keyval += '.' + gap }
    if (vlen) { keyval += ':' + vlen }
    else if (ps.pos === OBJ_B_V) { keyval += ':' }
  } else if (vlen) {
    keyval += vlen
  }

  var poschar = ''
  if (!keyval) {
    switch (ps.pos) {
      case OBJ_BFK:
      case ARR_BFV:
        poschar = '.'
        break
      case OBJ_B_K:
      case ARR_B_V:
        poschar = '+'
        break
      case ARR_A_V:
      case OBJ_A_V:
      case OBJ_A_K:
        poschar = '-'
        break
      case OBJ_B_V:
        poschar = ':'
        break
      default:
        err('pos not handled: ' + ps.pos)
    }
  }

  return stack + keyval + poschar + String.fromCharCode(ps.tok)
}

function str (ps) {
  var bytes = ps.vlim - ps.off
  return bytes + '/' +  ps.vcount + '/' + parse_state(ps)
}

// a convenience function for summarizing/logging/debugging callback arguments as compact strings
// converts the 'arguments' array from cb into a terse string code.
// only show value lengths for string, decimal, end and error tokens.
var NO_LEN_TOKENS = 'tfn[]{}()S'.split('').reduce(function (m,c) { m[c] = 1; return m }, {})
function args2str () {
  var a = arguments[0]
  var i = 1
// callback arguments [src, koff, klim, tok, voff, vlim, ps]
  var koff = a[i++], klim = a[i++], tok = a[i++], voff = a[i++], vlim = a[i++], ps = a[i++]

  var tchar = String.fromCharCode(tok)
  var keystr = koff === klim ? '' : 'k' + (klim - koff) + '@' + koff + ':'
  var vlen = (NO_LEN_TOKENS[tchar] || vlim === voff) ? '' : vlim - voff
  // var msg = tchar === '!' ? ': ' + message(ps) : ''

  return keystr + tchar + vlen + '@' + voff
}

function esc_str (src, off, lim) {
  var ret = ''
  for (var i = off; i < lim; i++) {
    var b = src[i]
    ret += (b > 31 && b < 127) ? String.fromCharCode(b) : '\\u' + ("0000" + b.toString(16)).slice(-4)
  }
  return ret
}

function tok_str (byte) {
  if (jtok.DECIMAL_ASCII[byte]) {
    return 'decimal'
  } else if (byte === 34) {
    return 'string'
  } else {
    return 'token'
  }
}

// figure out end/error message and callback token
function message (ps) {
  var ret

  switch (ps.tok) {
    case TOK.BAD_TOK:
      ret = 'unexpected ' + tok_str(ps.src[ps.voff]) + ' "' + esc_str(ps.src, ps.voff, ps.vlim) + '"'
      break
    case TOK.BAD_BYT:
      if (ps.voff === ps.vlim) {
        ret = 'unexpected byte ' + '"' + esc_str(ps.src, ps.voff, ps.vlim + 1) + '"'
      } else {
        ret = 'illegal ' + tok_str(ps.src[ps.voff]) + ' "' + esc_str(ps.src, ps.voff, ps.vlim + 1) + '"'
      }
      break
    case TOK.STOP:
      ret = 'client halted'
      break
    case TOK.LIM:
      if (ps.voff !== ps.vlim) {
        ret = 'truncated ' + tok_str(ps.src[ps.voff])
      } else if (ps.koff !== ps.klim) {
        ret = 'truncated key'
      } else {
        ret = 'done'
      }
      break
    default:
      err('internal error, end pos not handled: ' + ps.tok)
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
