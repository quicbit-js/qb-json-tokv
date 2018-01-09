
// finish truncated key/value
// return array of result info for the one or two call(s) made (may have halted)
//
// prev has previous completion (src, koff, klim, position...) - use, don't modify.
// init has new src and defaults (koff = 0, klim = 0...) (to be modified)
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

  var from_key = prev.koff !== prev.klim
  var adj = from_key ? prev.koff : prev.voff
  var psrc = concat(prev.src, adj, prev.lim, src, off, vlim)
  var p = {
    src: psrc,
    off: 0,
    len: psrc.length,
    koff: 0,
    klim: from_key ? prev.klim - adj : 0,
    tok: prev.tok,
    voff: prev.voff - adj,
    vlim: prev.vlim - adj,
    pos: prev.position.pos_code(),
    stack: prev.position.stack_codes(),
    vcount: 0
  }

  var ps = _tokenize(p, cb)
  if (ps.halted) {
    return [ps]
  }
  var init = init_defaults(src.slice(vlim), 0, lim - vlim)
  init.pos = POS_MAP[p.pos | prev.tok]        // pos was checked
  init.stack = p.stack
  return init
}


// use values from opt (and opt.restore) to recover from truncated values, making
// use of _tokenize as needed to restore recover and return updated {src, opt} that
// will be used to continue processing.
//
// attempt to convert previous tokenize result into initial pos.
function init_from_prev(src, off, lim, prev, cb) {
  // get vcount, stack, and pos from position and tok
  switch (prev.tok) {
    case TOK.TRUNC_VAL:
      return init_truncated(src, off, lim, prev, cb)
      break
    default: err('restore for ' + p.tok + ' not implemented')
  }
}



function finish_str (prev_src, ps, opt, cb) {
  var i = skip_str(ps.src, ps.vlim, ps.lim)
  if (i === -1) {
    err('could not complete string', ps)
  }
  ps.vlim = i
}

function finish_value (ps, opt, cb) {
  ps.next_src || err('missing next_src', ps)
  var len = ps.vlim - ps.voff
  len > 0 || err('beginning of value is missing')
  var first = ps.src[ps.voff]
  var vlim
  if (first === 34) {
    vlim = skip_str(ps, opt, cb)
  } else if (TOK_BYTES[first]) {
    var bsrc = TOK_BYTES[first].slice(len)
    vlim = skip_bytes(ps, opt, cb, bsrc)
  } else {
    vlim = skip_dec(ps, opt, cb)
  }
  vlim >= 0 || err('could not complete value')

  var off = (ps.pos === 'K') ? ps.koff : ps.voff

  if (ps.pos === 'K') {
    ps.pos = 'L'
  } else {
    ps.pos = 'W'
    if (ps.stack[ps.stack.length - 1] === 123) {
      // in object
      concat()
      // cb(ps.src, ps.)
    }
  }
}

