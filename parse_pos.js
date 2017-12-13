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
    return ctx + pos_str(this.state, ecode !== END.TRUNC_KEY && ecode !== END.TRUNC_VAL)
  },
  get in_arr () { return this.stack[this.stack.length - 1] === 91 },
  get in_obj () { return this.stack[this.stack.length - 1] === 123 },
  get parse_state () {
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
      ret += vlen   // only complete keys are represented by koff..klim.  truncations and other errors are all at voff/vlim
    } else if (this.ecode === END.TRUNC_VAL ) {
      if (in_obj) {
        if (this.state === ARR_B_V) {
          ret += vlen
        } else if (this.state === OBJ_B_V) {
          ret += klen + '.' + (gap - 1) + ':' + vlen
        } else {
          err('unexpected state for truncated value: ' + this.state)
        }
      } else {
        ret += vlen
      }
    } else {
      switch (this.state) {
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
          err('state not handled: ' + this.state)
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
