
var jtok = require('.')

var END = jtok.END
var TOK = jtok.TOK

// positions from jtok - not public and subject to change, so copied here (must keep in sync)
var ARR_BFV = 0x080
var ARR_B_V = 0x100
var ARR_A_V = 0x180
var OBJ_BFK = 0x200
var OBJ_B_K = 0x280
var OBJ_A_K = 0x300
var OBJ_BFV = 0x380
var OBJ_B_V = 0x400
var OBJ_A_V = 0x480

function pos_str (pos, relative) {
  switch (pos) {
    case OBJ_BFK: return relative ? 'before first key' : 'first key'
    case OBJ_B_K: return relative ? 'before key' : 'key'
    case OBJ_A_K: return relative ? 'after key' : 'key'
    case ARR_BFV: case OBJ_BFV: return relative ? 'before first value' : 'first value'
    case ARR_B_V: case OBJ_B_V: return relative ? 'before value' : 'value'
    case ARR_A_V: case OBJ_A_V: return relative ? 'after value' : 'value'
  }
}

function err (msg) { throw Error(msg) }

function within_value (ps) {
  return ps.tok === TOK.TRUNC_VAL ||
  (ps.tok === TOK.BAD_BYTE && ps.vlim - ps.voff > 1)    // unexpected byte within a token or number
}

function desc (ps) {
  var in_obj = ps.stack[ps.stack.length - 1] === 123
  var in_arr = ps.stack[ps.stack.length - 1] === 91
  var ctx = in_arr ? 'in array ' : (in_obj ? 'in object ' : '')
  return ctx + pos_str(ps.pos, !within_value(ps))
}

function parse_state (ps) {
  // var in_obj = ps.stack[ps.stack.length - 1] === 123
  var ret = ps.stack.map(function (b) { return String.fromCharCode(b) }).join('')
  var vlen = ps.vlim - ps.voff

  var klen = 0
  var gap = 0
  if (ps.koff !== -1) {
    gap = ps.voff - ps.klim
    klen = ps.klim - ps.koff
  }

  if (within_value(ps)) {
    if (ps.pos === OBJ_B_V) {
      ret += klen + '.' + (gap - 1) + ':' + vlen
    } else {
      ret += vlen
    }
  } else {
    switch (ps.pos) {
      case ARR_BFV:
      case OBJ_BFK:
        ret += '-'
        break
      case ARR_B_V:
      case OBJ_B_K:
        ret += ','
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
        err('pos not handled: ' + ps.pos)
    }
  }
  return ret
}

function str (ps) {
  var bytes = ps.vlim - ps.off
  var tbytes = ps.lim - ps.off
  return ps.vcount + '/' + bytes + ':' + tbytes + '/' + parse_state(ps)
}

// a convenience function for summarizing/logging/debugging callback arguments as compact strings
// converts the 'arguments' array from cb into a terse string code.
// only show value lengths for string, decimal, end and error tokens.
var NO_LEN_TOKENS = 'tfn[]{}()SI'.split('').reduce(function (m,c) { m[c] = 1; return m }, {})
function args2str () {
  var a = arguments[0]
  var i = 1
// callback arguments [src, koff, klim, tok, voff, vlim, ps]
  var koff = a[i++], klim = a[i++], tok = a[i++], voff = a[i++], vlim = a[i++], ps = a[i++]

  var tchar = String.fromCharCode(tok)
  var keystr = koff !== -1 ? 'k' + (klim - koff) + '@' + koff + ':' : ''
  var vlen = (!NO_LEN_TOKENS[tchar] && vlim !== voff) ? vlim - voff : ''
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

// figure out end/error message and callback token
function message (ps) {
  var val_str = esc_str(ps.src, ps.voff, ps.vlim)

  var tok_str = ps.tok === TOK.DEC ? 'decimal' : (ps.tok === TOK.STR ? 'string' : 'token')
  var ret

  switch (ps.tok) {
    case TOK.UNEXP_TOK:       // failed transition (pos0 + tok => pos1) === 0
      if (tok_str === 'token') { val_str = '"' + val_str + '"' }
      ret = 'unexpected ' + tok_str + ' ' + val_str
      break
    case TOK.BAD_BYTE:
      if (ps.vlim - ps.voff > 1) {
        ret = 'illegal ' + tok_str + ' "' + val_str + '"'
      } else {
        ret = 'unexpected byte ' + '"' + val_str + '"'
      }
      break
    case TOK.TRUNC_VAL:
      ret = 'truncated ' + tok_str
      break
    case TOK.INCOMPLETE:
      ret = 'truncated input'
      break
    case TOK.HALTED:
      ret = 'stopped early with clean state'
      break
    case TOK.DONE:
      ret = 'done'
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
