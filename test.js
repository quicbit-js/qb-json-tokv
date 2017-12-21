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

var test = require('test-kit').tape()
var utf8 = require('qb-utf8-ez')
var jtok = require('.')
var TOK = jtok.TOK
var pstate = require('./qb-json-state')

test('tokenize', function (t) {
  t.tableAssert(
    [
      [ 'src',                                      'off', 'lim', 'exp' ],
      [ '',                                         0,     null,  [ 'B@0,L@0', '0/0/-L' ] ],
      [ '1',                                        0,     null,  [ 'B@0,d1@0,L@1', '1/0/.L' ] ],
      [ '1,2,3',                                    0,     null,  [ 'd1@2,d1@4,L@5', '5/2/.L' ] ],
      [ '[1, 2], 3',                                0,     null,  [ ']@5,d1@8,L@9', '9/3/.L' ] ],
      [ '"x"',                                      0,     null,  [ 'B@0,s3@0,L@3', '3/1/.L' ] ],
      [ '-3.05',                                    0,     null,  [ 'B@0,d5@0,L@5', '5/0/.L' ] ],
      [ '-3.05',                                    1,     null,  [ 'B@1,d4@1,L@5', '4/0/.L' ] ],
      [ '\b  true',                                 0,     null,  [ 'B@0,t@3,L@7', '7/1/.L' ] ],
      [ '  true',                                   0,     null,  [ 'B@0,t@2,L@6', '6/1/.L' ] ],
      [ ' false  ',                                 0,     null,  [ 'B@0,f@1,L@8', '8/1/.L' ] ],
      [ ' false   ',                                1,     null,  [ 'B@1,f@1,L@9', '8/1/.L' ] ],
      [ '[1, 2, 3]',                                0,     null,  [ 'd1@7,]@8,L@9', '9/4/.L' ] ],
      [ '[3.05E-2]',                                0,     null,  [ 'd7@1,]@8,L@9', '9/2/.L' ] ],
      [ '[3.05E-2]',                                4,     5,     [ 'B@4,d1@4,L@5', '1/0/.L' ] ],
      [ '{"a":1}',                                  0,     null,  [ 'k3@1:d1@5,}@6,L@7', '7/2/.L' ] ],
      [ '{"a"  :1}',                                0,     null,  [ 'k3@1:d1@7,}@8,L@9', '9/2/.L' ] ],
      [ '{ "a" : 1 }',                              0,     null,  [ 'k3@2:d1@8,}@10,L@11', '11/2/.L' ] ],
      [ '"\\""',                                    0,     null,  [ 'B@0,s4@0,L@4', '4/1/.L' ] ],
      [ '"\\\\"',                                   0,     null,  [ 'B@0,s4@0,L@4', '4/1/.L' ] ],
      [ '\t\t"x\\a\r"  ',                           0,     null,  [ 'B@0,s6@2,L@10', '10/1/.L' ] ],
      [ '"\\"x\\"a\r\\""',                          0,     null,  [ 'B@0,s11@0,L@11', '11/1/.L' ] ],
      [ ' [0,1,2]',                                 0,     null,  [ 'd1@6,]@7,L@8', '8/4/.L' ] ],
      [ '["a", "bb"] ',                             0,     null,  [ 's4@6,]@10,L@12', '12/3/.L' ] ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null,  null,  [ 't@23,f@29,L@34', '34/6/.L' ] ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null,  null,  [ '}@30,]@34,L@35', '35/7/.L' ] ],
    ],
    function (input, off, lim) {
      var hector = t.hector()
      var cb_ps = null
      var cb = function (src, koff, klim, tok, voff, vlim, ps) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.LIM) { cb_ps = ps }
        return true
      }
      var ret_ps = jtok.tokenize({src: utf8.buffer(input), off: off, lim: lim}, null, cb)
      ret_ps === cb_ps || err('expected returned parse state to equal callback parse state')

      return [ hector.arg(0).slice(-3).join(','), pstate.str(ret_ps) ]
    }
  )
})

test('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',            'exp' ],
      // incomplete input
      [ '{"a" : ',          [ 'B@0,{@0', '7/0/{3.2:L' ] ],
      [ '{"a"',             [ 'B@0,{@0', '4/0/{3.L' ] ],
      [ '{"a" ',            [ 'B@0,{@0', '5/0/{3.1.L' ] ],
      [ '[1, 2, ',          [ '[@0,d1@1,d1@4', '7/2/[+L' ] ],
      [ 'fal',              [ 'B@0', '3/0/3-L' ] ],
      [ '"ab',              [ 'B@0', '3/0/3-L' ] ],
      [ '"ab:',             [ 'B@0', '4/0/4-L' ] ],
      [ '"\\\\\\"',         [ 'B@0', '5/0/5-L' ] ],
      [ '[3.05E-2',         [ 'B@0,[@0', '8/0/[7-L' ] ],
      [ '[3.05E-2,4.',      [ 'B@0,[@0,d7@1', '11/1/[2+L' ] ],
      [ '{"a',              [ 'B@0,{@0', '3/0/{2-L' ] ],

      // bad byte
      [ '{"a": q',          [ 'B@0,{@0', '6/0/{3.1:X' ] ],

      // bad byte in number
      [ '0*',               [ 'B@0', '1/0/1-X' ] ],
      [ '{"a":3^6}',        [ 'B@0,{@0', '6/0/{3:1:X' ] ],
      [ '1,2.4n',           [ 'B@0,d1@0', '5/1/3+X' ] ],
      [ ' 1f',              [ 'B@0', '2/0/1-X' ] ],

      // bad byte in token
      [ '{"a": t,',         [ 'B@0,{@0', '7/0/{3.1:1:X' ] ],

      // bad token
      [ '"a""b"',           [ 'B@0,s3@0', '6/1/3.T' ] ],
      [ '{"a""b"}',         [ 'B@0,{@0', '7/0/{3:3.T' ] ],
      [ '{"a"]',            [ 'B@0,{@0', '5/0/{3:1.T' ] ],
      [ '{"a": "b"]',       [ 'B@0,{@0,k3@1:s3@6', '10/1/{1.T' ] ],
      [ '{"a"::',           [ 'B@0,{@0', '6/0/{3:5:T' ] ],
      [ '0{',               [ 'B@0,d1@0', '2/1/1.T' ] ],
      [ '{ false:',         [ 'B@0,{@0', '7/0/{5-T' ] ],
      [ '{ fal',            [ 'B@0,{@0', '5/0/{3-T' ] ],
      [ '{ fal:',           [ 'B@0,{@0', '5/0/{3-T' ] ],
      [ '{"a": "b", 3: 4}', [ 'B@0,{@0,k3@1:s3@6', '12/1/{1+T' ] ],
      [ '{ 2.4 ]',          [ 'B@0,{@0', '5/0/{3-T' ] ],
      [ '{ "a" ]',          [ 'B@0,{@0', '7/0/{3.1:1.T' ] ],
      [ '[ 1, 2 ] "c',      [ 'd1@2,d1@5,]@7', '11/3/2.T' ] ],
      [ '[ 1, 2 ] "c"',     [ 'd1@2,d1@5,]@7', '12/3/3.T' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, ps) {
        hector(pstate.args2str(arguments))
        return true
      }
      // jtok.tokenize({src: utf8.buffer(src)}, null, cb)
      try {
        jtok.tokenize({src: utf8.buffer(src)}, null, cb)
      } catch (e) {
        return [ hector.arg(0).slice(-3).join(','), pstate.str(e.parse_state) ]
      }
    }
  )
})

test('callback stop', function (t) {
  t.table_assert(
    [
      [ 'src',                'at_cb', 'ret', 'exp' ],
      [ '{ "a": 7, "b": 4 }', 0,       false, [ 'B@0', '0/0/-S' ] ],
      [ '{ "a": 7, "b": 4 }', 1,       false, [ 'B@0,{@0', '1/0/{-S' ] ],
      [ '{ "a": 7, "b": 4 }', 2,       false, [ 'B@0,{@0,k3@2:d1@7', '8/1/{.S' ] ],
      [ '{ "a": 7, "b": 4 }', 3,       false, [ '{@0,k3@2:d1@7,k3@10:d1@15', '16/2/{.S' ] ],
      // if callback returns false at the src limit, the parse state is returned from _tokenize, but no end callback is made
      [ '{ "a": 7, "b": 4 }', 4,       false, [ 'k3@2:d1@7,k3@10:d1@15,}@17', '18/3/.S' ] ],
    ],
    function (src, at_cb, ret) {
      var count = 0
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, ps) {
        hector(pstate.args2str(arguments))
        if (ps && tok !== TOK.BEG) { err('stopped callback should not have an end/ps call') }
        return (count++ === at_cb) ? ret : true
      }
      var ps = jtok.tokenize({src: utf8.buffer(src)}, {incremental: true}, cb)
      return [ hector.arg(0).slice(-3).join(','), pstate.str(ps) ]
    }
  )
})

// completed parsing returns null and TOK.END callback info is null.
test('incremental clean',         function (t) {
  t.table_assert(
    [
      [ 'input',                  'exp' ],
      [ '',                       [ 'B@0,L@0', '0/0/-L' ] ],
      [ '3.23e12',                [ 'B@0,d7@0,L@7', '7/0/.L' ] ],
      [ '"abc"',                  [ 'B@0,s5@0,L@5', '5/1/.L' ] ],
      [ '[ 83 ]',                 [ 'd2@2,]@5,L@6', '6/2/.L' ] ],
      [ '[ 83, "a" ]',            [ 's3@6,]@10,L@11', '11/3/.L' ] ],
      [ '{ "a": 3 }',             [ 'k3@2:d1@7,}@9,L@10', '10/2/.L' ] ],
      [ '{ "a": 3, "b": 8 }',     [ 'k3@10:d1@15,}@17,L@18', '18/3/.L' ] ],
      [ '{ "a": 3, "b": [1,2] }', [ ']@19,}@21,L@22', '22/5/.L' ] ],
      [ 'null',                   [ 'B@0,n@0,L@4', '4/1/.L' ] ],
      [ ' 7E4 ',                  [ 'B@0,d3@1,L@5', '5/1/.L' ] ],
      [ '{ "a": 93, "b": [] }',   [ ']@17,}@19,L@20', '20/3/.L' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var end_ps = null
      var cb = function (src, koff, klim, tok, voff, vlim, ps) {
        hector(pstate.args2str(arguments))
        if (ps && tok !== TOK.BEG) { end_ps = ps }
        return true
      }
      var ps = jtok.tokenize({src: utf8.buffer(src)}, {incremental: true}, cb)
      ps === end_ps || err('expected returned parse state to equal end parse state')

      return [ hector.arg(0).slice(-3).join(','), pstate.str(ps) ]
    }
  )
})

test.only('incremental', function (t) {
  t.table_assert(
    [
      [ 'input',                'exp' ],
      [ '[',                    [ 'B@0,[@0,L@1', '1/0/[-L' ] ],
      [ '[ ',                   [ 'B@0,[@0,L@2', '2/0/[-L' ] ],
      [ '[ 8',                  [ 'B@0,[@0,L1@2', '3/0/[1-L' ] ],
      [ '[ 83',                 [ 'B@0,[@0,L2@2', '4/0/[2-L' ] ],
      [ '[ 83 ',                [ 'B@0,[@0,d2@2,L@5', '5/1/[.L' ] ],
      [ '[ 83 ,',               [ 'B@0,[@0,d2@2,L@6', '6/1/[+L' ] ],
      [ '[ 83 , ',              [ 'B@0,[@0,d2@2,L@7', '7/1/[+L' ] ],
      [ '[ 83 , "',             [ 'B@0,[@0,d2@2,L1@7', '8/1/[1+L' ] ],
      [ '[ 83 , "a',            [ 'B@0,[@0,d2@2,L2@7', '9/1/[2+L' ] ],
      [ '[ 83 , "a"',           [ 'B@0,[@0,d2@2,s3@7,L@10', '10/2/[.L' ] ],
      [ '[ 83 , "a",',          [ 'B@0,[@0,d2@2,s3@7,L@11', '11/2/[+L' ] ],
      [ '[ 83 , "a", ',         [ 'B@0,[@0,d2@2,s3@7,L@12', '12/2/[+L' ] ],
      [ '[ 83 , "a", 2',        [ 'B@0,[@0,d2@2,s3@7,L1@12', '13/2/[1+L' ] ],
      [ '[ 83 , "a", 2 ',       [ 'B@0,[@0,d2@2,s3@7,d1@12,L@14', '14/3/[.L' ] ],
      [ '[ 83 , "a", 2 ]',      [ 'B@0,[@0,d2@2,s3@7,d1@12,]@14,L@15', '15/4/.L' ] ],
      [ '{',                    [ 'B@0,{@0,L@1', '1/0/{-L' ] ],
      [ '{ "a"',                [ 'B@0,{@0,k3@2:L@5', '5/0/{3.L' ] ],
      [ '{ "a":',               [ 'B@0,{@0,k3@2:L@6', '6/0/{3:L' ] ],
      [ '{ "a": 9',             [ 'B@0,{@0,k3@2:L1@7', '8/0/{3.1:1:L' ] ],
      [ '{ "a": 93',            [ 'B@0,{@0,k3@2:L2@7', '9/0/{3.1:2:L' ] ],
      [ '{ "a": 93,',           [ 'B@0,{@0,k3@2:d2@7,L@10', '10/1/{+L' ] ],
      [ '{ "a": 93, ',          [ 'B@0,{@0,k3@2:d2@7,L@11', '11/1/{+L' ] ],
      [ '{ "a": 93, "b',        [ 'B@0,{@0,k3@2:d2@7,k2@11:L@13', '13/1/{2+L' ] ],
      [ '{ "a": 93, "b"',       [ 'B@0,{@0,k3@2:d2@7,k3@11:L@14', '14/1/{3.L' ] ],
      [ '{ "a": 93, "b":',      [ 'B@0,{@0,k3@2:d2@7,k3@11:L@15', '15/1/{3:L' ] ],
      [ '{ "a": 93, "b": [',    [ 'B@0,{@0,k3@2:d2@7,k3@11:[@16,L@17', '17/1/{[-L' ] ],
      [ '{ "a": 93, "b": []',   [ 'B@0,{@0,k3@2:d2@7,k3@11:[@16,]@17,L@18', '18/2/{.L' ] ],
      [ '{ "a": 93, "b": [] ',  [ 'B@0,{@0,k3@2:d2@7,k3@11:[@16,]@17,L@19', '19/2/{.L' ] ],
      [ '{ "a": 93, "b": [] }', [ 'B@0,{@0,k3@2:d2@7,k3@11:[@16,]@17,}@19,L@20', '20/3/.L' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var end_ps = null
      var cb = function (src, koff, klim, tok, voff, vlim, ps) {
        hector(pstate.args2str(arguments))
        if (ps && tok !== TOK.BEG) { end_ps = ps }
        return true
      }
      var ps = jtok.tokenize({src: utf8.buffer(src)}, {incremental: true}, cb)
      ps === end_ps || err('expected returned parse state to equal end parse state')

      return [ hector.arg(0).join(','), pstate.str(ps) ]
    }
  )
})

function err (msg) { throw Error(msg) }
/*
test('initial state', function (t) {
  var o = 123
  var a = 91
  t.table_assert([
    [ 'input',        'off',  'lim',  'src', 'state', 'err',    'stack',  'exp' ],
    [ '"abc"',        0,      null,   null,  BFV,      0,        [],     [ '(@0', 's5@0', ')@5' ] ],
    [ '"a',           0,      null,   null,  BFV,      0,        [],     [ '(@0', '!2@0: truncated string, at 0..1' ] ],
    // [ 'bc"',           0,      null,   null,  BFV,     TRUNC_vAL, [],     [ '(@0', '!2@1: truncated string, at 1..2' ] ],
    // [ '{"a": 3.3}',     4,      null,   null,  OBJ|a_K, TRUNC_vAL, [o],     [ '(@4', 'd3@6', '}@9', ')@10' ] ],
  ], function (input, off, lim, state, err, stack) {
    var hector = t.hector()
    var cb = function (src, koff, klim, tok, voff, vlim, ps) {
      hector(pstate.args2str(koff, klim, tok, voff, vlim, ps))
      return true
    }
    jtok.tokenize(utf8.buffer(input), { off: off, lim: lim, init: { state: state, stack: stack, err: err } }, cb)
    return hector.arg(0)
  })
})

test('incremental processing', function (t) {
  t.table_assert([
    [ 'inputs',                         'exp' ],
    [ ['"ab',    'c"' ],                [] ],
    // [ ['{ "a": ', '23 }']],
  ], function (inputs) {
    var opt = {incremental: 1, init: null}
    var hector = t.hector()
    var cb = function (src, koff, klim, tok, voff, vlim, ps) {
      hector(pstate.args2str(koff, klim, tok, voff, vlim, ps))
      return true
    }
    inputs.forEach(function (input) {
      var src = utf8.buffer(input)
      opt.init = jtok.tokenize(src, opt, cb)
    })
    return hector.arg(0)
  })
})
*/