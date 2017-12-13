var STATES = {
  ARR_BFV: 0x080,
  ARR_B_V: 0x100,
  ARR_A_V: 0x180,
  OBJ_BFK: 0x200,
  OBJ_B_K: 0x280,
  OBJ_A_K: 0x300,
  OBJ_BFV: 0x380,
  OBJ_B_V: 0x400,
  OBJ_A_V: 0x480,
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

function pos_str (state, relative) {
  switch (state) {
    case STATES.OBJ_BFK: return relative ? 'before first key' : 'first key'
    case STATES.OBJ_B_K: return relative ? 'before key' : 'key'
    case STATES.OBJ_A_K: return relative ? 'after key' : 'key'
    case STATES.ARR_BFV: case STATES.OBJ_BFV: return relative ? 'before first value' : 'first value'
    case STATES.ARR_B_V: case STATES.OBJ_B_V: return relative ? 'before value' : 'value'
    case STATES.ARR_A_V: case STATES.OBJ_A_V: return relative ? 'after value' : 'value'
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
// Position represents parse position information - both logical and absolute (bytes).  Format (line and column) is
// not tracked by Position.
function Position (params) {
  assign(this, params)
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
        if (this.state === STATES.ARR_B_V) {
          ret += vlen
        } else if (this.state === STATES.OBJ_B_V) {
          ret += klen + '.' + (gap - 1) + ':' + vlen
        } else {
          err('unexpected state for truncated value: ' + this.state)
        }
      } else {
        ret += vlen
      }
    } else {
      switch (this.state) {
        case STATES.ARR_BFV:
        case STATES.OBJ_BFK:
          ret += '-'
          break
        case STATES.ARR_B_V:
        case STATES.OBJ_B_K:
          ret += '+'
          break
        case STATES.ARR_A_V:
        case STATES.OBJ_A_V:
          ret += '.'
          break
        case STATES.OBJ_A_K:
          ret += klen + (gap > 0 ? '.' + gap : '') + '.'
          break
        case STATES.OBJ_B_V:
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

module.exports = {
  create: function (params) { return new Position(params) }
}
