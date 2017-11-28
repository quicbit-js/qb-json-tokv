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
var qbobj = require('qb-obj')
var jtok = require('.')

// other tokens are intuitive - they are the same char code as the first byte parsed
// 't' for true
// 'f' for false
// 'n' for null
// '{' for object start
// '}' for object end
// '[' for array start
// ...

// a formatting callback is a good way to understand the output of the tokenizer.  See readme.
//
//     'S4@0' means String, length 4 bytes, at offset zero.  (length includes the quotes).
//     'K3@1' means Key, length 3 bytes, at offset 1
//     'N3@5' means Number, length 3 bytes, at offset 5
//     'n@9'  means null at offset 9                         (null length is always 4 bytes)
//     't@23' means true at offset 23 ...
test('tokenize', function (t) {
  t.tableAssert(
    [
      [ 'src',             'off',  'lim',          'exp'                                ],
      [ '"x"',             0,       null,          [ 'B@0', 'S3@0', 'E@3']                           ],
      [ '-3.05',           0,       null,          [ 'B@0', 'N5@0', 'E@5' ]                          ],
      [ '-3.05',           1,       null,          [ 'B@1', 'N4@1', 'E@5' ]                          ],
      [ '  true',          0,       null,          [ 'B@0', 't@2', 'E@6' ]                           ],
      [ ' false  ',        0,       null,          [ 'B@0', 'f@1', 'E@8' ]                           ],
      [ ' false   ',       1,       null,          [ 'B@1', 'f@1', 'E@9' ]                           ],
      [ '[3.05E-2]',       0,       null,          [ 'B@0', '[@0', 'N7@1', ']@8', 'E@9' ]            ],
      [ '[3.05E-2]',       4,       5,             [ 'B@4', 'N1@4', 'E@5' ]            ],
      [ '{"a":1}',         0,       null,          [ 'B@0', '{@0', 'K3@1:N1@5', '}@6', 'E@7' ]         ],
      [ '{"a"  :1}',       0,       null,          [ 'B@0', '{@0', 'K3@1:N1@7', '}@8', 'E@9' ]         ],
      [ '{ "a" : 1 }',     0,       null,          [ 'B@0', '{@0', 'K3@2:N1@8', '}@10', 'E@11' ]     ],
      [ '"\\""',           0,       null,          [ 'B@0', 'S4@0', 'E@4' ]                          ],
      [ '"\\\\"',          0,       null,          [ 'B@0', 'S4@0', 'E@4' ]                          ],
      [ '\t\t"x\\a\r"  ',  0,       null,          [ 'B@0', 'S6@2', 'E@10']                          ],
      [ '"\\"x\\"a\r\\""', 0,       null,          [ 'B@0', 'S11@0', 'E@11']                         ],
      [ ' [0,1,2]',        0,       null,          [ 'B@0', '[@1','N1@2','N1@4','N1@6',']@7','E@8']  ],
      [ '["a", "bb"] ',    0,       null,          [ 'B@0', '[@0','S3@1','S4@6',']@10', 'E@12' ]     ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null, null,   [ 'B@0', 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29', 'E@34']         ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null, null,   [ 'B@0', '[@0','S3@1','N3@5','{@11','K3@13:[@19','S3@20','S3@25',']@28','}@30',']@34', 'E@35' ] ],
    ],
    function (input, off, lim) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
        return true
      }
      jtok.tokenize(utf8.buffer(input), {off: off, lim: lim}, cb)
      return hector.arg(0)
    }
  )
})

test.only('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',            'exp' ],
      // unexpected bytes
      [ '0*',               [ 'B@0', 'N1@0', '!1@1: unexpected byte "*", after value, at 1' ] ],
      [ '{"a":3^6}',        [ 'B@0', '{@0', 'K3@1:N1@5', '!1@6: unexpected byte "^", in object, after value, at 6' ] ],
      [ ' 1f',              [ 'B@0', 'N1@1', '!1@2: unexpected byte "f", after value, at 2' ] ],
      [ '1,2n',             [ 'B@0', 'N1@0', 'N1@2', '!1@3: unexpected byte "n", after value, at 3' ] ],

      // unexpected tokens
      [ '{"a"::',           [ 'B@0', '{@0', 'K3@1:!1@5: unexpected token ":", in object, before value, at 5' ] ],
      [ '0{',               [ 'B@0', 'N1@0', '!1@1: unexpected token "{", after value, at 1' ] ],
      [ '{ false:',         [ 'B@0', '{@0', '!5@2: unexpected token "false", in object, before first key, at 2..6' ] ],
      // a token truncated by limit is treated optimistically
      [ '{ fal',            [ 'B@0', '{@0', '!3@2: unexpected token "fal", in object, before first key, at 2..4' ] ],
      [ '{ fal:',           [ 'B@0', '{@0', '!3@2: unexpected token "fal", in object, before first key, at 2..4' ] ],

      // truncated values / keys
      [ 'fal',              [ 'B@0', '!3@0: truncated value, at 0..2' ] ],
      [ '"ab',              [ 'B@0', '!3@0: truncated value, at 0..2' ] ],
      [ '"\\\\\\"',         [ 'B@0', '!5@0: truncated value, at 0..4' ] ],
      [ '[3.05E-2',         [ 'B@0', '[@0', '!7@1: truncated value, at 1..7' ] ],
      [ '[3.05E-2,4.',      [ 'B@0', '[@0', 'N7@1', '!2@9: truncated value, at 9..10' ] ],
      [ '{"a": t,',         [ 'B@0', '{@0', 'K3@1:!1@6: truncated value, at 6' ] ],

      // truncated input (not an error in incremental mode)
      [ '{"a" : ',          [ 'B@0', '{@0', 'K3@1:!0@7: truncated input, in object, before value, at 7' ] ],
      [ '{"a"',             [ 'B@0', '{@0', 'K3@1:!0@4: truncated input, in object, after key, at 4' ] ],
      [ '{"a" ',            [ 'B@0', '{@0', 'K3@1:!0@5: truncated input, in object, after key, at 5' ] ],
    ],
    function (input) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
        return true
      }
      jtok.tokenize(utf8.buffer(input), null, cb)
      return hector.arg(0)
    }
  )
})

var ST = jtok.STATE

var OBJ = ST.IN_OBJ
var ARR = ST.IN_ARR

var BFK = ST.BEFORE_FIRST_KEY
var B_K = ST.BEFORE_KEY
var A_K = ST.AFTER_KEY

var BFV = ST.BEFORE_FIRST_VAL
var B_V = ST.BEFORE_VAL
var A_V = ST.AFTER_VAL

test('incremental state', function (t) {
  t.table_assert([
    [ 'input',                    'exp' ],
    [ '"abc"',                    null ],
    [ '[ 83 ]',                   null ],
    [ '[ 83, "a" ]',              null ],
    [ '3.23e12',                  null ],
    [ '{ "a": 3 }',               null ],
    [ '{ "a": 3, "b": 8 }',       null ],
    [ '{ "a": 3, "b": [1,2] }',   null ],
    [ 'null',                     null ],
    [ ' 7E4 ',                    null ],
    [ '',                         null ],
    [ '"abc", ',                  { idx: 7,  state: B_V,      stack: [] } ],
    [ '[',                        { idx: 1,  state: ARR|BFV,  stack: [ 91 ] } ],
    [ '[ 83 ',                    { idx: 5,  state: ARR|A_V,  stack: [ 91 ] } ],
    [ '[ 83,',                    { idx: 5,  state: ARR|B_V,  stack: [ 91 ] } ],
    [ '[ 83, "a"',                { idx: 9,  state: ARR|A_V,  stack: [ 91 ] } ],
    [ '[ 83, "a",',               { idx: 10, state: ARR|B_V,  stack: [ 91 ] } ],
    [ '{',                        { idx: 1,  state: OBJ|BFK,  stack: [ 123 ] } ],
    [ '{ "a"',                    { idx: 5,  state: OBJ|A_K,  stack: [ 123 ] } ],
    [ '{ "a":',                   { idx: 6,  state: OBJ|B_V,  stack: [ 123 ] } ],
    [ '{ "a": 9, ',               { idx: 10, state: OBJ|B_K,  stack: [ 123 ] } ],
    [ '{ "a": 9, "b"',            { idx: 13, state: OBJ|A_K,  stack: [ 123 ] } ],
    [ '{ "a": 9, "b": ',          { idx: 15, state: OBJ|B_V,  stack: [ 123 ] } ],
    [ '{ "a": 9, "b": [',         { idx: 16, state: ARR|BFV,  stack: [ 123, 91 ] } ],
  ], function (input) {
    var src = utf8.buffer(input)
    var ret = jtok.tokenize(src, {incremental: true}, function () {return true} )
    if (ret === null ) {
      return null
    }
    return qbobj.select(ret, ['idx', 'state', 'stack'])
  })
})
/*
test('initial state', function (t) {
  var o = 123
  var a = 91
  t.table_assert([
    [ 'input',          'off',  'lim',  'src', 'state',             'stack',  'exp' ],
    [ ' "abc"',         0,      null,   null,  BFV,    [],       [ 'B@0', 'S5@1', 'E@6' ] ],
    [ ' "a',            0,      null,   null,  BFV,    [],       [ 'B@0', 'truncated string, at idx 3' ] ],
    // [ '{"a": 3.3}',     4,      null,   OBJ|A_K,    [o],      TOK.STR,   [ 'B@4', 'N3@6', '}@9', 'E@10' ] ],
  ], function (input, off, lim, state, stack) {
    var hector = t.hector()
    var cb = function (src, koff, klim, tok, voff, vlim, info) {
      hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
      return true
    }
    jtok.tokenize(utf8.buffer(input), { off: off, lim: lim, init: { state: state, stack: stack } }, cb)
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
    var cb = function (src, koff, klim, tok, voff, vlim, info) {
      hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
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