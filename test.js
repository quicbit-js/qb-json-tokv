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
var pstate = require('qb-json-state')

test('tokenize', function (t) {
  t.tableAssert(
    [
      [ 'src',                                      'off', 'lim', 'exp' ],
      // [ '',                                         0,     null,  [ 'B@0,E@0', '0/0/F' ] ],
      [ '1',                                        0,     null,  [ 'B@0,d1@0,E@1', '1/0/W' ] ],
      [ '1,2,3',                                    0,     null,  [ 'd1@2,d1@4,E@5', '5/2/W' ] ],
      [ '[1, 2], 3',                                0,     null,  [ ']@5,d1@8,E@9', '9/3/W' ] ],
      [ '"x"',                                      0,     null,  [ 'B@0,s3@0,E@3', '3/1/W' ] ],
      [ '-3.05',                                    0,     null,  [ 'B@0,d5@0,E@5', '5/0/W' ] ],
      [ '-3.05',                                    1,     null,  [ 'B@1,d4@1,E@5', '5/0/W' ] ],
      [ '\b  true',                                 0,     null,  [ 'B@0,t@3,E@7', '7/1/W' ] ],
      [ '  true',                                   0,     null,  [ 'B@0,t@2,E@6', '6/1/W' ] ],
      [ ' false  ',                                 0,     null,  [ 'B@0,f@1,E@8', '8/1/W' ] ],
      [ ' false   ',                                1,     null,  [ 'B@1,f@1,E@9', '9/1/W' ] ],
      [ '[1, 2, 3]',                                0,     null,  [ 'd1@7,]@8,E@9', '9/4/W' ] ],
      [ '[3.05E-2]',                                0,     null,  [ 'd7@1,]@8,E@9', '9/2/W' ] ],
      [ '[3.05E-2]',                                4,     5,     [ 'B@4,d1@4,E@5', '5/0/W' ] ],
      [ '{"a":1}',                                  0,     null,  [ 'k3@1:d1@5,}@6,E@7', '7/2/W' ] ],
      [ '{"a":1,"b":{}}',                           0,     null,  [ '}@12,}@13,E@14', '14/3/W' ] ],
      [ '{"a"  :1}',                                0,     null,  [ 'k3@1:d1@7,}@8,E@9', '9/2/W' ] ],
      [ '{ "a" : 1 }',                              0,     null,  [ 'k3@2:d1@8,}@10,E@11', '11/2/W' ] ],
      [ '"\\""',                                    0,     null,  [ 'B@0,s4@0,E@4', '4/1/W' ] ],
      [ '"\\\\"',                                   0,     null,  [ 'B@0,s4@0,E@4', '4/1/W' ] ],
      [ '\t\t"x\\a\r"  ',                           0,     null,  [ 'B@0,s6@2,E@10', '10/1/W' ] ],
      [ '"\\"x\\"a\r\\""',                          0,     null,  [ 'B@0,s11@0,E@11', '11/1/W' ] ],
      [ ' [0,1,2]',                                 0,     null,  [ 'd1@6,]@7,E@8', '8/4/W' ] ],
      [ '["a", "bb"] ',                             0,     null,  [ 's4@6,]@10,E@12', '12/3/W' ] ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null,  null,  [ 't@23,f@29,E@34', '34/6/W' ] ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null,  null,  [ '}@30,]@34,E@35', '35/7/W' ] ],
    ],
    function (input, off, lim) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, ps) {
        hector(pstate.args2str(arguments))
        return true
      }
      var ret_ps = jtok.tokenize({src: utf8.buffer(input), off: off, lim: lim}, null, cb)
      return [ hector.arg(0).slice(-3).join(','), pstate.encode(ret_ps) ]
    }
  )
})

test('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',            'exp' ],

      // incomplete input
      [ '{"a": ',           [ 'B@0,{@0', '6/0/{U3.1' ] ],
      [ '[1, 2, ',          [ '[@0,d1@1,d1@4', '7/2/[U' ] ],
      [ 'fal',              [ 'B@0', '3/0/V3' ] ],
      [ '"ab',              [ 'B@0', '3/0/V3' ] ],
      [ '{"ab":',           [ 'B@0,{@0', '6/0/{U4' ] ],
      [ '"\\\\\\"',         [ 'B@0', '5/0/V5' ] ],
      [ '[3.05E-2',         [ 'B@0,[@0', '8/0/[V7' ] ],
      [ '[3.05E-2,4.',      [ 'B@0,[@0,d7@1', '11/1/[V2' ] ],
      [ '{"a',              [ 'B@0,{@0', '3/0/{K2' ] ],

      // bad byte
      [ '{"a"q',            [ 'B@0,{@0', '4/0/{L3!X' ] ],
      [ '{"a":q',           [ 'B@0,{@0', '5/0/{U3!X' ] ],
      [ '{"a": q',          [ 'B@0,{@0', '6/0/{U3.1!X' ] ],
      [ '{"a" :  q',        [ 'B@0,{@0', '8/0/{U3.3!X' ] ],

      // bad byte in number
      [ '0*',               [ 'B@0', '1/0/V1!X' ] ],
      [ '1, 2.4n',          [ 'B@0,d1@0', '6/1/V3!X' ] ],
      [ '{"a": 3^6}',       [ 'B@0,{@0', '7/0/{V3.1:1!X' ] ],
      [ ' 1f',              [ 'B@0', '2/0/V1!X' ] ],

      // bad byte in value
      [ '{"a": t,',         [ 'B@0,{@0', '7/0/{V3.1:1!X' ] ],

      // unexpected value
      [ '"a""b"',           [ 'B@0,s3@0',           '6/1/W!U' ] ],
      [ '{"a"]',            [ 'B@0,{@0',            '5/0/{L3!U' ] ],
      [ '{"a""b"}',         [ 'B@0,{@0',            '7/0/{L3!U' ] ],   // unexpected value has length 3
      [ '{"a": "b"]',       [ 'B@0,{@0,k3@1:s3@6',  '10/1/{W!U' ] ],
      [ '["a", "b"}',       [ '[@0,s3@1,s3@6',      '10/2/[W!U' ] ],
      [ '0{',               [ 'B@0,d1@0',           '2/1/W!U' ] ],
      [ '{"a"::',           [ 'B@0,{@0',            '6/0/{U3!U' ] ],
      [ '{ false:',         [ 'B@0,{@0',            '7/0/{F!U' ] ],
      [ '{ fal',            [ 'B@0,{@0',            '5/0/{F!U' ] ],
      [ '{ fal:',           [ 'B@0,{@0',            '5/0/{F!U' ] ],
      [ '{"a": "b", 3: 4}', [ 'B@0,{@0,k3@1:s3@6',  '12/1/{J!U' ] ],
      [ '{ 2.4 ]',          [ 'B@0,{@0',            '5/0/{F!U' ] ],
      [ '{ "a" ]',          [ 'B@0,{@0',            '7/0/{L3.1!U' ] ],
      [ '[ 1, 2 ] "c',      [ 'd1@2,d1@5,]@7',      '11/3/W!U' ] ],
      [ '[ 1, 2 ] "c"',     [ 'd1@2,d1@5,]@7',      '12/3/W!U' ] ],
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
        return [ hector.arg(0).slice(-3).join(','), pstate.encode(e.parse_state) ]
      }
    }
  )
})

test('callback stop', function (t) {
  t.table_assert(
    [
      [ 'src',                'at_cb', 'ret', 'exp' ],
      [ '{ "a": 7, "b": 4 }', 0,       false, [ 'B@0', '0/0/F' ] ],
      [ '{ "a": 7, "b": 4 }', 1,       false, [ 'B@0,{@0', '1/0/{F' ] ],
      [ '{ "a": 7, "b": 4 }', 2,       false, [ 'B@0,{@0,k3@2:d1@7', '8/1/{W' ] ],
      [ '{ "a": 7, "b": 4 }', 3,       false, [ '{@0,k3@2:d1@7,k3@10:d1@15', '16/2/{W' ] ],
      // if callback returns false at the src limit, the parse state is returned from _tokenize, but no end callback is made
      [ '{ "a": 7, "b": 4 }', 4,       false, [ 'k3@2:d1@7,k3@10:d1@15,}@17', '18/3/W' ] ],
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
      return [ hector.arg(0).slice(-3).join(','), pstate.encode(ps) ]
    }
  )
})

function parse (src, t) {
  var hector = t.hector()
  var cb = function (src, koff, klim, tok, voff, vlim, ps) {
    hector(pstate.args2str(arguments))
    return true
  }
  var ps = jtok.tokenize({src: utf8.buffer(src)}, {incremental: true}, cb)
  return [ hector.arg(0).join(','), pstate.encode(ps) ]
}

test('incremental object - no spaces', function (t) {
  t.table_assert(
    [
      [ 'input',          'exp' ],

      [ '',               [ 'B@0,E@0',                      '0/0/F' ] ],
      [ '{',              [ 'B@0,{@0,E@1',                  '1/0/{F' ] ],
      [ '{"',             [ 'B@0,{@0,k1@1:E@2',             '2/0/{K1' ] ],
      [ '{"a',            [ 'B@0,{@0,k2@1:E@3',             '3/0/{K2' ] ],
      [ '{"a"',           [ 'B@0,{@0,k3@1:E@4',             '4/0/{L3' ] ],
      [ '{"a":',          [ 'B@0,{@0,k3@1:E@5',             '5/0/{U3' ] ],
      [ '{"a":7',         [ 'B@0,{@0,k3@1:E1@5',            '6/0/{V3:1' ] ],
      [ '{"a":71',        [ 'B@0,{@0,k3@1:E2@5',            '7/0/{V3:2' ] ],

      [ '{"a":71,',       [ 'B@0,{@0,k3@1:d2@5,E@8',        '8/1/{J' ] ],
      [ '{"a":71,"',      [ 'B@0,{@0,k3@1:d2@5,k1@8:E@9',   '9/1/{K1' ] ],
      [ '{"a":71,"b',     [ 'B@0,{@0,k3@1:d2@5,k2@8:E@10',  '10/1/{K2' ] ],
      [ '{"a":71,"b"',    [ 'B@0,{@0,k3@1:d2@5,k3@8:E@11',  '11/1/{L3' ] ],
      [ '{"a":71,"b":',   [ 'B@0,{@0,k3@1:d2@5,k3@8:E@12',  '12/1/{U3' ] ],
      [ '{"a":71,"b":2',  [ 'B@0,{@0,k3@1:d2@5,k3@8:E1@12', '13/1/{V3:1' ] ],
      
      [ '{"a":71,"b":2}', [ 'B@0,{@0,k3@1:d2@5,k3@8:d1@12,}@13,E@14', '14/3/W' ] ],
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
      [ '',           [ 'B@0,E@0', '0/0/F' ] ],
      [ '[',          [ 'B@0,[@0,E@1', '1/0/[F' ] ],
      [ '[8',         [ 'B@0,[@0,E1@1', '2/0/[V1' ] ],
      [ '[83',        [ 'B@0,[@0,E2@1', '3/0/[V2' ] ],
      [ '[83 ',       [ 'B@0,[@0,d2@1,E@4', '4/1/[W' ] ],
      [ '[83,',       [ 'B@0,[@0,d2@1,E@4', '4/1/[U' ] ],
      [ '[83,"',      [ 'B@0,[@0,d2@1,E1@4', '5/1/[V1' ] ],
      [ '[83,"a',     [ 'B@0,[@0,d2@1,E2@4', '6/1/[V2' ] ],
      [ '[83,"a"',    [ 'B@0,[@0,d2@1,s3@4,E@7', '7/2/[W' ] ],
      [ '[83,"a",',   [ 'B@0,[@0,d2@1,s3@4,E@8', '8/2/[U' ] ],
      [ '[83,"a",2',  [ 'B@0,[@0,d2@1,s3@4,E1@8', '9/2/[V1' ] ],
      [ '[83,"a",2]', [ 'B@0,[@0,d2@1,s3@4,d1@8,]@9,E@10', '10/4/W' ] ],
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
      [ '',                [ 'B@0,E@0', '0/0/F' ] ],
      [ '[',               [ 'B@0,[@0,E@1', '1/0/[F' ] ],
      [ '[ ',              [ 'B@0,[@0,E@2', '2/0/[F' ] ],
      [ '[ 8',             [ 'B@0,[@0,E1@2', '3/0/[V1' ] ],
      [ '[ 83',            [ 'B@0,[@0,E2@2', '4/0/[V2' ] ],
      [ '[ 83,',           [ 'B@0,[@0,d2@2,E@5', '5/1/[U' ] ],
      [ '[ 83, ',          [ 'B@0,[@0,d2@2,E@6', '6/1/[U' ] ],
      [ '[ 83, "',         [ 'B@0,[@0,d2@2,E1@6', '7/1/[V1' ] ],
      [ '[ 83, "a',        [ 'B@0,[@0,d2@2,E2@6', '8/1/[V2' ] ],
      [ '[ 83, "a"',       [ 'B@0,[@0,d2@2,s3@6,E@9', '9/2/[W' ] ],
      [ '[ 83, "a" ',      [ 'B@0,[@0,d2@2,s3@6,E@10', '10/2/[W' ] ],
      [ '[ 83, "a" ,',     [ 'B@0,[@0,d2@2,s3@6,E@11', '11/2/[U' ] ],
      [ '[ 83, "a" , ',    [ 'B@0,[@0,d2@2,s3@6,E@12', '12/2/[U' ] ],
      [ '[ 83, "a" , 2',   [ 'B@0,[@0,d2@2,s3@6,E1@12', '13/2/[V1' ] ],
      [ '[ 83, "a" , 2 ',  [ 'B@0,[@0,d2@2,s3@6,d1@12,E@14', '14/3/[W' ] ],
      [ '[ 83, "a" , 2 ]', [ 'B@0,[@0,d2@2,s3@6,d1@12,]@14,E@15', '15/4/W' ] ],    ],
    function (src) {
      return parse(src, t)
    }
  )
})

test('incremental object - spaces', function (t) {
  t.table_assert(
    [
      [ 'input',          'exp' ],
      [ ' ',              [ 'B@0,E@1', '1/0/F' ] ],
      [ ' {',             [ 'B@0,{@1,E@2', '2/0/{F' ] ],
      [ ' { ',            [ 'B@0,{@1,E@3', '3/0/{F' ] ],
      [ ' { "',           [ 'B@0,{@1,k1@3:E@4', '4/0/{K1' ] ],
      [ ' { "a',          [ 'B@0,{@1,k2@3:E@5', '5/0/{K2' ] ],
      [ ' { "a"',         [ 'B@0,{@1,k3@3:E@6', '6/0/{L3' ] ],
      [ ' { "a":',        [ 'B@0,{@1,k3@3:E@7', '7/0/{U3' ] ],
      [ ' { "a": ',       [ 'B@0,{@1,k3@3:E@8', '8/0/{U3.1' ] ],
      [ ' { "a": "',      [ 'B@0,{@1,k3@3:E1@8', '9/0/{V3.1:1' ] ],
      [ ' { "a": "x',     [ 'B@0,{@1,k3@3:E2@8', '10/0/{V3.1:2' ] ],
      [ ' { "a": "x"',    [ 'B@0,{@1,k3@3:s3@8,E@11', '11/1/{W' ] ],
      [ ' { "a": "x" }',  [ 'B@0,{@1,k3@3:s3@8,}@12,E@13', '13/2/W' ] ],
      [ ' { "a" ',        [ 'B@0,{@1,k3@3:E@7', '7/0/{L3.1' ] ],
      [ ' { "a" :',       [ 'B@0,{@1,k3@3:E@8', '8/0/{U3.1' ] ],
      [ ' { "a" : ',      [ 'B@0,{@1,k3@3:E@9', '9/0/{U3.2' ] ],
      [ ' { "a" : "',     [ 'B@0,{@1,k3@3:E1@9', '10/0/{V3.2:1' ] ],
      [ ' { "a" : "x',    [ 'B@0,{@1,k3@3:E2@9', '11/0/{V3.2:2' ] ],
      [ ' { "a" : "x" ',  [ 'B@0,{@1,k3@3:s3@9,E@13', '13/1/{W' ] ],
      [ ' { "a" : "x" }', [ 'B@0,{@1,k3@3:s3@9,}@13,E@14', '14/2/W' ] ],
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
