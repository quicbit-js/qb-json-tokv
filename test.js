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
      [ '',                                         0,     null,  [ 'B@0,L@0', '0/0/.L' ] ],
      [ '1',                                        0,     null,  [ 'B@0,d1@0,L@1', '1/0/-L' ] ],
      [ '1,2,3',                                    0,     null,  [ 'd1@2,d1@4,L@5', '5/2/-L' ] ],
      [ '[1, 2], 3',                                0,     null,  [ ']@5,d1@8,L@9', '9/3/-L' ] ],
      [ '"x"',                                      0,     null,  [ 'B@0,s3@0,L@3', '3/1/-L' ] ],
      [ '-3.05',                                    0,     null,  [ 'B@0,d5@0,L@5', '5/0/-L' ] ],
      [ '-3.05',                                    1,     null,  [ 'B@1,d4@1,L@5', '4/0/-L' ] ],
      [ '\b  true',                                 0,     null,  [ 'B@0,t@3,L@7', '7/1/-L' ] ],
      [ '  true',                                   0,     null,  [ 'B@0,t@2,L@6', '6/1/-L' ] ],
      [ ' false  ',                                 0,     null,  [ 'B@0,f@1,L@8', '8/1/-L' ] ],
      [ ' false   ',                                1,     null,  [ 'B@1,f@1,L@9', '8/1/-L' ] ],
      [ '[1, 2, 3]',                                0,     null,  [ 'd1@7,]@8,L@9', '9/4/-L' ] ],
      [ '[3.05E-2]',                                0,     null,  [ 'd7@1,]@8,L@9', '9/2/-L' ] ],
      [ '[3.05E-2]',                                4,     5,     [ 'B@4,d1@4,L@5', '1/0/-L' ] ],
      [ '{"a":1}',                                  0,     null,  [ 'k3@1:d1@5,}@6,L@7', '7/2/-L' ] ],
      [ '{"a"  :1}',                                0,     null,  [ 'k3@1:d1@7,}@8,L@9', '9/2/-L' ] ],
      [ '{ "a" : 1 }',                              0,     null,  [ 'k3@2:d1@8,}@10,L@11', '11/2/-L' ] ],
      [ '"\\""',                                    0,     null,  [ 'B@0,s4@0,L@4', '4/1/-L' ] ],
      [ '"\\\\"',                                   0,     null,  [ 'B@0,s4@0,L@4', '4/1/-L' ] ],
      [ '\t\t"x\\a\r"  ',                           0,     null,  [ 'B@0,s6@2,L@10', '10/1/-L' ] ],
      [ '"\\"x\\"a\r\\""',                          0,     null,  [ 'B@0,s11@0,L@11', '11/1/-L' ] ],
      [ ' [0,1,2]',                                 0,     null,  [ 'd1@6,]@7,L@8', '8/4/-L' ] ],
      [ '["a", "bb"] ',                             0,     null,  [ 's4@6,]@10,L@12', '12/3/-L' ] ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null,  null,  [ 't@23,f@29,L@34', '34/6/-L' ] ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null,  null,  [ '}@30,]@34,L@35', '35/7/-L' ] ],
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
      [ '{"a": ',           [ 'B@0,{@0', '6/0/{3.1:L' ] ],
      [ '[1, 2, ',          [ '[@0,d1@1,d1@4', '7/2/[+L' ] ],
      [ 'fal',              [ 'B@0', '3/0/3L' ] ],
      [ '"ab',              [ 'B@0', '3/0/3L' ] ],
      [ '"ab:',             [ 'B@0', '4/0/4L' ] ],
      [ '"\\\\\\"',         [ 'B@0', '5/0/5L' ] ],
      [ '[3.05E-2',         [ 'B@0,[@0', '8/0/[7L' ] ],
      [ '[3.05E-2,4.',      [ 'B@0,[@0,d7@1', '11/1/[2L' ] ],
      [ '{"a',              [ 'B@0,{@0', '3/0/{2L' ] ],

      // bad byte
      [ '{"a"q',            [ 'B@0,{@0', '4/0/{3X' ] ],
      [ '{"a":q',           [ 'B@0,{@0', '5/0/{3:X' ] ],
      [ '{"a": q',          [ 'B@0,{@0', '6/0/{3.1:X' ] ],
      [ '{"a" :  q',        [ 'B@0,{@0', '8/0/{3.3:X' ] ],

      // bad byte in number
      [ '0*',               [ 'B@0', '1/0/1X' ] ],
      [ '1, 2.4n',          [ 'B@0,d1@0', '6/1/3X' ] ],
      [ '{"a": 3^6}',       [ 'B@0,{@0', '7/0/{3.1:1X' ] ],
      [ ' 1f',              [ 'B@0', '2/0/1X' ] ],

      // bad byte in token
      [ '{"a": t,',         [ 'B@0,{@0', '7/0/{3.1:1X' ] ],

      // bad token
      [ '"a""b"',           [ 'B@0,s3@0', '6/1/3T' ] ],
      [ '{"a""b"}',         [ 'B@0,{@0', '7/0/{3:3T' ] ],
      [ '{"a"]',            [ 'B@0,{@0', '5/0/{3:1T' ] ],
      [ '{"a": "b"]',       [ 'B@0,{@0,k3@1:s3@6', '10/1/{1T' ] ],
      [ '0{',               [ 'B@0,d1@0', '2/1/1T' ] ],
      [ '{"a"::',           [ 'B@0,{@0', '6/0/{3:1T' ] ],
      [ '{ false:',         [ 'B@0,{@0', '7/0/{5T' ] ],
      [ '{ fal',            [ 'B@0,{@0', '5/0/{3T' ] ],
      [ '{ fal:',           [ 'B@0,{@0', '5/0/{3T' ] ],
      [ '{"a": "b", 3: 4}', [ 'B@0,{@0,k3@1:s3@6', '12/1/{1T' ] ],
      [ '{ 2.4 ]',          [ 'B@0,{@0', '5/0/{3T' ] ],
      [ '{ "a" ]',          [ 'B@0,{@0', '7/0/{3.1:1T' ] ],
      [ '[ 1, 2 ] "c',      [ 'd1@2,d1@5,]@7', '11/3/2T' ] ],
      [ '[ 1, 2 ] "c"',     [ 'd1@2,d1@5,]@7', '12/3/3T' ] ],
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
      [ '{ "a": 7, "b": 4 }', 0,       false, [ 'B@0', '0/0/.S' ] ],
      [ '{ "a": 7, "b": 4 }', 1,       false, [ 'B@0,{@0', '1/0/{.S' ] ],
      [ '{ "a": 7, "b": 4 }', 2,       false, [ 'B@0,{@0,k3@2:d1@7', '8/1/{-S' ] ],
      [ '{ "a": 7, "b": 4 }', 3,       false, [ '{@0,k3@2:d1@7,k3@10:d1@15', '16/2/{-S' ] ],
      // if callback returns false at the src limit, the parse state is returned from _tokenize, but no end callback is made
      [ '{ "a": 7, "b": 4 }', 4,       false, [ 'k3@2:d1@7,k3@10:d1@15,}@17', '18/3/-S' ] ],
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

function parse (src, t) {
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

test('incremental array - no spaces', function (t) {
  t.table_assert(
    [
      [ 'input',          'exp' ],

      [ '',               [ 'B@0,L@0', '0/0/.L' ] ],
      [ '[',              [ 'B@0,[@0,L@1',  '1/0/[.L' ] ],
      [ '["',             [ 'B@0,[@0,L1@1', '2/0/[1L' ] ],
      [ '["a',            [ 'B@0,[@0,L2@1', '3/0/[2L' ] ],

      [ '["a"',           [ 'B@0,[@0,s3@1,L@4',  '4/1/[-L' ] ],
      [ '["a",',          [ 'B@0,[@0,s3@1,L@5',  '5/1/[+L' ] ],
      [ '["a",7',         [ 'B@0,[@0,s3@1,L1@5', '6/1/[1L' ] ],
      [ '["a",71',        [ 'B@0,[@0,s3@1,L2@5', '7/1/[2L' ] ],

      [ '["a",71,',       [ 'B@0,[@0,s3@1,d2@5,L@8',  '8/2/[+L' ] ],
      [ '["a",71,"',      [ 'B@0,[@0,s3@1,d2@5,L1@8', '9/2/[1L' ] ],
      [ '["a",71,"b',     [ 'B@0,[@0,s3@1,d2@5,L2@8', '10/2/[2L' ] ],
      [ '["a",71,"b"',    [ 'B@0,[@0,s3@1,d2@5,s3@8,L@11',  '11/3/[-L' ] ],
      [ '["a",71,"b",',   [ 'B@0,[@0,s3@1,d2@5,s3@8,L@12',  '12/3/[+L' ] ],
      [ '["a",71,"b",2',  [ 'B@0,[@0,s3@1,d2@5,s3@8,L1@12', '13/3/[1L' ] ],

      [ '["a",71,"b",2]', [ 'B@0,[@0,s3@1,d2@5,s3@8,d1@12,]@13,L@14', '14/5/-L' ] ],
    ],
    function (src) {
      return parse(src, t)
    }
  )
})

test('incremental object - no spaces', function (t) {
  t.table_assert(
    [
      [ 'input',          'exp' ],

      [ '',               [ 'B@0,L@0',                      '0/0/.L' ] ],
      [ '{',              [ 'B@0,{@0,L@1',                  '1/0/{.L' ] ],
      [ '{"',             [ 'B@0,{@0,k1@1:L@2',             '2/0/{1L' ] ],
      [ '{"a',            [ 'B@0,{@0,k2@1:L@3',             '3/0/{2L' ] ],
      [ '{"a"',           [ 'B@0,{@0,k3@1:L@4',             '4/0/{3L' ] ],
      [ '{"a":',          [ 'B@0,{@0,k3@1:L@5',             '5/0/{3:L' ] ],
      [ '{"a":7',         [ 'B@0,{@0,k3@1:L1@5',            '6/0/{3:1L' ] ],
      [ '{"a":71',        [ 'B@0,{@0,k3@1:L2@5',            '7/0/{3:2L' ] ],
      
      [ '{"a":71,',       [ 'B@0,{@0,k3@1:d2@5,L@8',        '8/1/{+L' ] ],
      [ '{"a":71,"',      [ 'B@0,{@0,k3@1:d2@5,k1@8:L@9',   '9/1/{1L' ] ],
      [ '{"a":71,"b',     [ 'B@0,{@0,k3@1:d2@5,k2@8:L@10',  '10/1/{2L' ] ],
      [ '{"a":71,"b"',    [ 'B@0,{@0,k3@1:d2@5,k3@8:L@11',  '11/1/{3L' ] ],
      [ '{"a":71,"b":',   [ 'B@0,{@0,k3@1:d2@5,k3@8:L@12',  '12/1/{3:L' ] ],
      [ '{"a":71,"b":2',  [ 'B@0,{@0,k3@1:d2@5,k3@8:L1@12', '13/1/{3:1L' ] ],
      
      [ '{"a":71,"b":2}', [ 'B@0,{@0,k3@1:d2@5,k3@8:d1@12,}@13,L@14', '14/3/-L' ] ],
    ],
    function (src) {
      return parse(src, t)
    }
  )
})

test('incremental array - no spaces', function (t) {
  t.table_assert(
    [
      [ 'input',      'exp' ],
      [ '',           [ 'B@0,L@0', '0/0/.L' ] ],
      [ '[',          [ 'B@0,[@0,L@1', '1/0/[.L' ] ],
      [ '[8',         [ 'B@0,[@0,L1@1', '2/0/[1L' ] ],
      [ '[83',        [ 'B@0,[@0,L2@1', '3/0/[2L' ] ],
      [ '[83,',       [ 'B@0,[@0,d2@1,L@4', '4/1/[+L' ] ],
      [ '[83,"',      [ 'B@0,[@0,d2@1,L1@4', '5/1/[1L' ] ],
      [ '[83,"a',     [ 'B@0,[@0,d2@1,L2@4', '6/1/[2L' ] ],
      [ '[83,"a"',    [ 'B@0,[@0,d2@1,s3@4,L@7', '7/2/[-L' ] ],
      [ '[83,"a",',   [ 'B@0,[@0,d2@1,s3@4,L@8', '8/2/[+L' ] ],
      [ '[83,"a",2',  [ 'B@0,[@0,d2@1,s3@4,L1@8', '9/2/[1L' ] ],
      [ '[83,"a",2]', [ 'B@0,[@0,d2@1,s3@4,d1@8,]@9,L@10', '10/4/-L' ] ],
    ],
    function (src) {
      return parse(src, t)
    }
  )
})

test('incremental array - spaces', function (t) {
  t.table_assert(
    [
      [ 'input',           'exp' ],
      [ '',                [ 'B@0,L@0', '0/0/.L' ] ],
      [ '[',               [ 'B@0,[@0,L@1', '1/0/[.L' ] ],
      [ '[ ',              [ 'B@0,[@0,L@2', '2/0/[.L' ] ],
      [ '[ 8',             [ 'B@0,[@0,L1@2', '3/0/[1L' ] ],
      [ '[ 83',            [ 'B@0,[@0,L2@2', '4/0/[2L' ] ],
      [ '[ 83',            [ 'B@0,[@0,L2@2', '4/0/[2L' ] ],
      [ '[ 83,',           [ 'B@0,[@0,d2@2,L@5', '5/1/[+L' ] ],
      [ '[ 83, ',          [ 'B@0,[@0,d2@2,L@6', '6/1/[+L' ] ],
      [ '[ 83, "',         [ 'B@0,[@0,d2@2,L1@6', '7/1/[1L' ] ],
      [ '[ 83, "a',        [ 'B@0,[@0,d2@2,L2@6', '8/1/[2L' ] ],
      [ '[ 83, "a"',       [ 'B@0,[@0,d2@2,s3@6,L@9', '9/2/[-L' ] ],
      [ '[ 83, "a" ',      [ 'B@0,[@0,d2@2,s3@6,L@10', '10/2/[-L' ] ],
      [ '[ 83, "a" ,',     [ 'B@0,[@0,d2@2,s3@6,L@11', '11/2/[+L' ] ],
      [ '[ 83, "a" , ',    [ 'B@0,[@0,d2@2,s3@6,L@12', '12/2/[+L' ] ],
      [ '[ 83, "a" , 2',   [ 'B@0,[@0,d2@2,s3@6,L1@12', '13/2/[1L' ] ],
      [ '[ 83, "a" , 2 ',  [ 'B@0,[@0,d2@2,s3@6,d1@12,L@14', '14/3/[-L' ] ],
      [ '[ 83, "a" , 2 ]', [ 'B@0,[@0,d2@2,s3@6,d1@12,]@14,L@15', '15/4/-L' ] ],    ],
    function (src) {
      return parse(src, t)
    }
  )
})

test('incremental object - spaces1', function (t) {
  t.table_assert(
    [
      [ 'input',      'exp' ],
      [ '',           [ 'B@0,L@0', '0/0/.L' ] ],
      [ '{',          [ 'B@0,{@0,L@1', '1/0/{.L' ] ],
      [ '{',          [ 'B@0,{@0,L@1', '1/0/{.L' ] ],
      [ '{"',         [ 'B@0,{@0,k1@1:L@2', '2/0/{1L' ] ],
      [ '{"a',        [ 'B@0,{@0,k2@1:L@3', '3/0/{2L' ] ],
      [ '{"a"',       [ 'B@0,{@0,k3@1:L@4', '4/0/{3L' ] ],
      [ '{"a":',      [ 'B@0,{@0,k3@1:L@5', '5/0/{3:L' ] ],
      [ '{"a": ',     [ 'B@0,{@0,k3@1:L@6', '6/0/{3.1:L' ] ],
      [ '{"a": "',    [ 'B@0,{@0,k3@1:L1@6', '7/0/{3.1:1L' ] ],
      [ '{"a": "x',   [ 'B@0,{@0,k3@1:L2@6', '8/0/{3.1:2L' ] ],
      [ '{"a": "x"',  [ 'B@0,{@0,k3@1:s3@6,L@9', '9/1/{-L' ] ],
      [ '{"a": "x"}', [ 'B@0,{@0,k3@1:s3@6,}@9,L@10', '10/2/-L' ] ],
    ],
    function (src) {
      return parse(src, t)
    }
  )
})

test('incremental object - spaces2', function (t) {
  t.table_assert(
    [
      [ 'input',          'exp' ],
      [ '',               [ 'B@0,L@0', '0/0/.L' ] ],
      [ ' ',              [ 'B@0,L@1', '1/0/.L' ] ],
      [ ' {',             [ 'B@0,{@1,L@2', '2/0/{.L' ] ],
      [ ' { ',            [ 'B@0,{@1,L@3', '3/0/{.L' ] ],
      [ ' { "',           [ 'B@0,{@1,k1@3:L@4', '4/0/{1L' ] ],
      [ ' { "a',          [ 'B@0,{@1,k2@3:L@5', '5/0/{2L' ] ],
      [ ' { "a"',         [ 'B@0,{@1,k3@3:L@6', '6/0/{3L' ] ],
      [ ' { "a" ',        [ 'B@0,{@1,k3@3:L@7', '7/0/{3.1L' ] ],
      [ ' { "a" :',       [ 'B@0,{@1,k3@3:L@8', '8/0/{3.1:L' ] ],
      [ ' { "a" : ',      [ 'B@0,{@1,k3@3:L@9', '9/0/{3.2:L' ] ],
      [ ' { "a" : "',     [ 'B@0,{@1,k3@3:L1@9', '10/0/{3.2:1L' ] ],
      [ ' { "a" : "x',    [ 'B@0,{@1,k3@3:L2@9', '11/0/{3.2:2L' ] ],
      [ ' { "a" : "x"',   [ 'B@0,{@1,k3@3:s3@9,L@12', '12/1/{-L' ] ],
      [ ' { "a" : "x" ',  [ 'B@0,{@1,k3@3:s3@9,L@13', '13/1/{-L' ] ],
      [ ' { "a" : "x" }', [ 'B@0,{@1,k3@3:s3@9,}@13,L@14', '14/2/-L' ] ],
    ],
    function (src) {
      return parse(src, t)
    }
  )
})


function err (msg) { throw Error(msg) }

// // parse string
// function iparse(s1) {
//
// }
//
// function token_str (t, src, ps) {
//   var hector = t.hector()
//   var cb = function (src, koff, klim, tok, voff, vlim, ps) {
//     hector(pstate.args2str(arguments))
//     return true
//   }
//   var nps = jtok.tokenize({src: utf8.buffer(src), ps: ps}, {incremental: true}, cb)
//   var tokens = hector.arg(0)
//   tokens[0] === 'B@0' || err('expected begin token')
//   t.last(tokens)[0] === 'L' || err('expected limit token: ' + t.last(tokens))
//   return { tokens: hector.arg(0).slice(1,-1).join(','), ps: nps }
// }
//
// test('incremental processing', function (t) {
//   t.table_assert([
//     [ 'src',          'i',              'exp' ],
//     [ '"abc"',        0,                's5@0' ],
//     [ '"abc"',        1,                's5@0' ],
//   ], function (src, i) {
//     var res1 =  token_str(t, src.substring(0,i))
//
//     var res2 = token_str(t, src.substring(i), res1.ps)
//   })
// })
