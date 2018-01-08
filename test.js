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
      // [ '1',                                        0,     null,  [ 'B@0,d1@0,E@1', '1/0/W' ] ],
      // [ '1,2,3',                                    0,     null,  [ 'd1@2,d1@4,E@5', '5/2/W' ] ],
      // [ '[1, 2], 3',                                0,     null,  [ ']@5,d1@8,E@9', '9/3/W' ] ],
      [ '"x"',                                      0,     null,  [ 'B@0,s3@0,E@3', '3/1/W' ] ],
      [ '-3.05',                                    0,     null,  [ 'B@0,d5@0,E@5', '5/0/W' ] ],
      [ '-3.05',                                    1,     null,  [ 'B@1,d4@1,E@5', '5/0/W' ] ],
      [ '\b  true',                                 0,     null,  [ 'B@0,t@3,E@7', '7/1/W' ] ],
      [ '  true',                                   0,     null,  [ 'B@0,t@2,E@6', '6/1/W' ] ],
      [ 'false',                                    0,     null,  [ 'B@0,f@0,E@5', '5/1/W' ] ],
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
      var toks = []
      var cb = function (ps) {
        toks.push(pstate.tokstr(ps))
        return true
      }
      var ret_ps = jtok.tokenize({src: utf8.buffer(input), off: off, lim: lim}, null, cb)
      return [ toks.slice(-3).join(','), pstate.encode(ret_ps) ]
    }
  )
})

test('errors', function (t) {
  t.table_assert([
    [ 'ps',                     'opt',    'exp' ],
    [ {},                       null,        /missing src property/ ],
    [ {src: [], trunc: true},   null,        /cannot handle truncated value/ ],
  ], jtok.tokenize, {assert: 'throws'})
})

test('parse error state', function (t) {
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
      [ '{ "a"]',           [ 'B@0,{@0',            '6/0/{L3!U' ] ],
      [ '{ "a" ]',          [ 'B@0,{@0',            '7/0/{L3.1!U' ] ],
      [ '{ "a":]',          [ 'B@0,{@0',            '7/0/{U3!U' ] ],
      [ '{ "a": ]',         [ 'B@0,{@0',            '8/0/{U3.1!U' ] ],
      [ '{ 2.4',            [ 'B@0,{@0',            '5/0/{F!U' ] ],
      [ '[ 1, 2 ] "c',      [ 'd1@2,d1@5,]@7',      '11/3/W!U' ] ],
      [ '[ 1, 2 ] "c"',     [ 'd1@2,d1@5,]@7',      '12/3/W!U' ] ],
    ],
    function (src) {
      var toks = []
      var cb = function (ps) {
        toks.push(pstate.tokstr(ps))
        return true
      }
      // jtok.tokenize({src: utf8.buffer(src)}, null, cb)
      try {
        jtok.tokenize({src: utf8.buffer(src)}, null, cb)
      } catch (e) {
        return [ toks.slice(-3).join(','), pstate.encode(e.parse_state) ]
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
      var cb = function (ps) {
        hector(pstate.tokstr(ps))
        return (count++ === at_cb) ? ret : true
      }
      var ps = jtok.tokenize({src: utf8.buffer(src)}, {incremental: true}, cb)
      return [ hector.arg(0).slice(-3).join(','), pstate.encode(ps) ]
    }
  )
})

function capture_parse (ps_in, opt, t) {
  var hector = t.hector()
  var cb = function (ps) { hector(pstate.tokstr(ps)); return true }
  var ps_out = jtok.tokenize(ps_in, opt, cb)
  return { args: hector.arg(0), ps: ps_out }
}

test('object - no spaces', function (t) {
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
      var r = capture_parse({src: utf8.buffer(src)}, {incremental: true}, t)
      return [ r.args.join(','), pstate.encode(r.ps) ]
    }
  )
})

test('array - no spaces', function (t) {
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
      var r = capture_parse({src: utf8.buffer(src)}, {incremental: true}, t)
      return [ r.args.join(','), pstate.encode(r.ps) ]
    }
  )
})

test('array - spaces', function (t) {
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
      var r = capture_parse({src: utf8.buffer(src)}, {incremental: true}, t)
      return [ r.args.join(','), pstate.encode(r.ps) ]
    }
  )
})

test('object - spaces', function (t) {
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
      var r = capture_parse({src: utf8.buffer(src)}, {incremental: true}, t)
      return [ r.args.join(','), pstate.encode(r.ps) ]
    }
  )
})

test('incremental array', function (t) {
  t.table_assert([
    [ 'src1',               'src2',               'exp' ],
    [ '',                   '1,[[[7,89.4],"c"]]', [ 'B@0,E@0', '0/0/F', 'B@0,d1@0,[@2,[@3,[@4,d1@5,d4@7,]@11,s3@13,]@16,]@17,E@18', '18/7/W' ] ],
    [ '1,',                 '[[[7,89.4],"c"]]',   [ 'B@0,d1@0,E@2', '2/1/U', 'B@0,[@0,[@1,[@2,d1@3,d4@5,]@9,s3@11,]@14,]@15,E@16', '16/7/W' ] ],
    [ '1,[',                '[[7,89.4],"c"]]',    [ 'B@0,d1@0,[@2,E@3', '3/1/[F', 'B@0,[@0,[@1,d1@2,d4@4,]@8,s3@10,]@13,]@14,E@15', '15/7/W' ] ],
    [ '1,[[',               '[7,89.4],"c"]]',     [ 'B@0,d1@0,[@2,[@3,E@4', '4/1/[[F', 'B@0,[@0,d1@1,d4@3,]@7,s3@9,]@12,]@13,E@14', '14/7/W' ] ],
    [ '1,[[[',              '7,89.4],"c"]]',      [ 'B@0,d1@0,[@2,[@3,[@4,E@5', '5/1/[[[F', 'B@0,d1@0,d4@2,]@6,s3@8,]@11,]@12,E@13', '13/7/W' ] ],
    [ '1,[[[7,',            '89.4],"c"]]',        [ 'B@0,d1@0,[@2,[@3,[@4,d1@5,E@7', '7/2/[[[U', 'B@0,d4@0,]@4,s3@6,]@9,]@10,E@11', '11/7/W' ] ],
    [ '1,[[[7,89.4]',       ',"c"]]',             [ 'B@0,d1@0,[@2,[@3,[@4,d1@5,d4@7,]@11,E@12', '12/4/[[W', 'B@0,s3@1,]@4,]@5,E@6', '6/7/W' ] ],
    [ '1,[[[7,89.4],',      '"c"]]',              [ 'B@0,d1@0,[@2,[@3,[@4,d1@5,d4@7,]@11,E@13', '13/4/[[U', 'B@0,s3@0,]@3,]@4,E@5', '5/7/W' ] ],
    [ '1,[[[7,89.4],"c"',   ']]',                 [ 'B@0,d1@0,[@2,[@3,[@4,d1@5,d4@7,]@11,s3@13,E@16', '16/5/[[W', 'B@0,]@0,]@1,E@2', '2/7/W' ] ],
    [ '1,[[[7,89.4],"c"]',  ']',                  [ 'B@0,d1@0,[@2,[@3,[@4,d1@5,d4@7,]@11,s3@13,]@16,E@17', '17/6/[W', 'B@0,]@0,E@1', '1/7/W' ] ],
    [ '1,[[[7,89.4],"c"]]', '',                   [ 'B@0,d1@0,[@2,[@3,[@4,d1@5,d4@7,]@11,s3@13,]@16,]@17,E@18', '18/7/W', 'B@0,E@0', '0/7/W' ] ],
  ], function (src1, src2) {
    return parse_split(src1, src2, t)
  })
})

test('incremental array - spaces', function (t) {
  t.table_assert([
    [ 'src1',                        'src2',                        'exp' ],
    [ '',                            ' 1 , [ [ [7,89.4], "c" ] ] ', [ 'B@0,E@0', '0/0/F', 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,]@23,]@25,E@27', '27/7/W' ] ],
    [ ' ',                           '1 , [ [ [7,89.4], "c" ] ] ',  [ 'B@0,E@1', '1/0/F', 'B@0,d1@0,[@4,[@6,[@8,d1@9,d4@11,]@15,s3@18,]@22,]@24,E@26', '26/7/W' ] ],
    [ ' 1 ',                         ', [ [ [7,89.4], "c" ] ] ',    [ 'B@0,d1@1,E@3', '3/1/W', 'B@0,[@2,[@4,[@6,d1@7,d4@9,]@13,s3@16,]@20,]@22,E@24', '24/7/W' ] ],
    [ ' 1 ,',                        ' [ [ [7,89.4], "c" ] ] ',     [ 'B@0,d1@1,E@4', '4/1/U', 'B@0,[@1,[@3,[@5,d1@6,d4@8,]@12,s3@15,]@19,]@21,E@23', '23/7/W' ] ],
    [ ' 1 , ',                       '[ [ [7,89.4], "c" ] ] ',      [ 'B@0,d1@1,E@5', '5/1/U', 'B@0,[@0,[@2,[@4,d1@5,d4@7,]@11,s3@14,]@18,]@20,E@22', '22/7/W' ] ],
    [ ' 1 , [',                      ' [ [7,89.4], "c" ] ] ',       [ 'B@0,d1@1,[@5,E@6', '6/1/[F', 'B@0,[@1,[@3,d1@4,d4@6,]@10,s3@13,]@17,]@19,E@21', '21/7/W' ] ],
    [ ' 1 , [ ',                     '[ [7,89.4], "c" ] ] ',        [ 'B@0,d1@1,[@5,E@7', '7/1/[F', 'B@0,[@0,[@2,d1@3,d4@5,]@9,s3@12,]@16,]@18,E@20', '20/7/W' ] ],
    [ ' 1 , [ [',                    ' [7,89.4], "c" ] ] ',         [ 'B@0,d1@1,[@5,[@7,E@8', '8/1/[[F', 'B@0,[@1,d1@2,d4@4,]@8,s3@11,]@15,]@17,E@19', '19/7/W' ] ],
    [ ' 1 , [ [ ',                   '[7,89.4], "c" ] ] ',          [ 'B@0,d1@1,[@5,[@7,E@9', '9/1/[[F', 'B@0,[@0,d1@1,d4@3,]@7,s3@10,]@14,]@16,E@18', '18/7/W' ] ],
    [ ' 1 , [ [ [',                  '7,89.4], "c" ] ] ',           [ 'B@0,d1@1,[@5,[@7,[@9,E@10', '10/1/[[[F', 'B@0,d1@0,d4@2,]@6,s3@9,]@13,]@15,E@17', '17/7/W' ] ],
    [ ' 1 , [ [ [7,',                '89.4], "c" ] ] ',             [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,E@12', '12/2/[[[U', 'B@0,d4@0,]@4,s3@7,]@11,]@13,E@15', '15/7/W' ] ],
    [ ' 1 , [ [ [7,89.4]',           ', "c" ] ] ',                  [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,E@17', '17/4/[[W', 'B@0,s3@2,]@6,]@8,E@10', '10/7/W' ] ],
    [ ' 1 , [ [ [7,89.4],',          ' "c" ] ] ',                   [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,E@18', '18/4/[[U', 'B@0,s3@1,]@5,]@7,E@9', '9/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], ',         '"c" ] ] ',                    [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,E@19', '19/4/[[U', 'B@0,s3@0,]@4,]@6,E@8', '8/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], "c"',      ' ] ] ',                       [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,E@22', '22/5/[[W', 'B@0,]@1,]@3,E@5', '5/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], "c" ',     '] ] ',                        [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,E@23', '23/5/[[W', 'B@0,]@0,]@2,E@4', '4/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], "c" ]',    ' ] ',                         [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,]@23,E@24', '24/6/[W', 'B@0,]@1,E@3', '3/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], "c" ] ',   '] ',                          [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,]@23,E@25', '25/6/[W', 'B@0,]@0,E@2', '2/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], "c" ] ]',  ' ',                           [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,]@23,]@25,E@26', '26/7/W', 'B@0,E@1', '1/7/W' ] ],
    [ ' 1 , [ [ [7,89.4], "c" ] ] ', '',                            [ 'B@0,d1@1,[@5,[@7,[@9,d1@10,d4@12,]@16,s3@19,]@23,]@25,E@27', '27/7/W', 'B@0,E@0', '0/7/W' ] ],
  ], function (src, split) {
    return parse_split(src, split, t)
  })
})

test('incremental object', function (t) {
  t.table_assert([
    [ 'src1',                  'src2',                  'exp' ],
    [ '',                      '1,{"a":"one","b":[2]}', [ 'B@0,E@0', '0/0/F', 'B@0,d1@0,{@2,k3@3:s5@7,k3@13:[@17,d1@18,]@19,}@20,E@21', '21/5/W' ] ],
    [ '1,',                    '{"a":"one","b":[2]}',   [ 'B@0,d1@0,E@2', '2/1/U', 'B@0,{@0,k3@1:s5@5,k3@11:[@15,d1@16,]@17,}@18,E@19', '19/5/W' ] ],
    [ '1,{',                   '"a":"one","b":[2]}',    [ 'B@0,d1@0,{@2,E@3', '3/1/{F', 'B@0,k3@0:s5@4,k3@10:[@14,d1@15,]@16,}@17,E@18', '18/5/W' ] ],
    [ '1,{"a":"one"',          ',"b":[2]}',             [ 'B@0,d1@0,{@2,k3@3:s5@7,E@12', '12/2/{W', 'B@0,k3@1:[@5,d1@6,]@7,}@8,E@9', '9/5/W' ] ],
    [ '1,{"a":"one",',         '"b":[2]}',              [ 'B@0,d1@0,{@2,k3@3:s5@7,E@13', '13/2/{J', 'B@0,k3@0:[@4,d1@5,]@6,}@7,E@8', '8/5/W' ] ],
    [ '1,{"a":"one","b":[2]',  '}',                     [ 'B@0,d1@0,{@2,k3@3:s5@7,k3@13:[@17,d1@18,]@19,E@20', '20/4/{W', 'B@0,}@0,E@1', '1/5/W' ] ],
    [ '1,{"a":"one","b":[2]}', '',                      [ 'B@0,d1@0,{@2,k3@3:s5@7,k3@13:[@17,d1@18,]@19,}@20,E@21', '21/5/W', 'B@0,E@0', '0/5/W' ] ],
  ], function (src1, src2) {
    return parse_split(src1, src2, t)
  })
})

function parse_split (src1, src2, t) {
  var r1 = capture_parse({src: utf8.buffer(src1)}, {incremental: true}, t)
  var ps = {
    src: utf8.buffer(src2),
    stack: r1.ps.stack.slice(),
    pos: r1.ps.pos,
    vcount: r1.ps.vcount,
  }
  var r2 = capture_parse(ps, {incremental: true}, t)
  
  return [ r1.args.join(','), pstate.encode(r1.ps), r2.args.join(','), pstate.encode(r2.ps) ]
}

function err (msg) { throw Error(msg) }

