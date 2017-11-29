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
      [ 'src',             'off',  'lim',          'exp' ],
      [ '[1, 2], 3',       0,       null,          [ 'B@0', '[@0', 'N1@1', 'N1@4', ']@5', 'N1@8', 'E@9' ] ],
      [ '"x"',             0,       null,          [ 'B@0', 'S3@0', 'E@3' ]  ],
      [ '-3.05',           0,       null,          [ 'B@0', 'N5@0', 'E@5' ] ],
      [ '-3.05',           1,       null,          [ 'B@1', 'N4@1', 'E@5' ] ],
      [ '  true',          0,       null,          [ 'B@0', 't@2', 'E@6' ]  ],
      [ ' false  ',        0,       null,          [ 'B@0', 'f@1', 'E@8' ]  ],
      [ ' false   ',       1,       null,          [ 'B@1', 'f@1', 'E@9' ]  ],
      [ '[1, 2, 3]',       0,       null,          [ 'B@0', '[@0', 'N1@1', 'N1@4', 'N1@7', ']@8', 'E@9' ]  ],
      [ '[3.05E-2]',       0,       null,          [ 'B@0', '[@0', 'N7@1', ']@8', 'E@9' ] ],
      [ '[3.05E-2]',       4,       5,             [ 'B@4', 'N1@4', 'E@5' ] ],
      [ '{"a":1}',         0,       null,          [ 'B@0', '{@0', 'K3@1:N1@5', '}@6', 'E@7' ] ],
      [ '{"a"  :1}',       0,       null,          [ 'B@0', '{@0', 'K3@1:N1@7', '}@8', 'E@9' ] ],
      [ '{ "a" : 1 }',     0,       null,          [ 'B@0', '{@0', 'K3@2:N1@8', '}@10', 'E@11' ]  ],
      [ '"\\""',           0,       null,          [ 'B@0', 'S4@0', 'E@4' ]  ],
      [ '"\\\\"',          0,       null,          [ 'B@0', 'S4@0', 'E@4' ]  ],
      [ '\t\t"x\\a\r"  ',  0,       null,          [ 'B@0', 'S6@2', 'E@10']  ],
      [ '"\\"x\\"a\r\\""', 0,       null,          [ 'B@0', 'S11@0', 'E@11'] ],
      [ ' [0,1,2]',        0,       null,          [ 'B@0', '[@1','N1@2','N1@4','N1@6',']@7','E@8']  ],
      [ '["a", "bb"] ',    0,       null,          [ 'B@0', '[@0','S3@1','S4@6',']@10', 'E@12' ]     ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null, null,   [ 'B@0', 'S3@0','N1@5','n@9','N5@15','t@23', 'f@29', 'E@34']         ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null, null,   [ 'B@0', '[@0','S3@1','N3@5','{@11','K3@13:[@19','S3@20','S3@25',']@28','}@30',']@34', 'E@35' ] ],
    ],
    function (src, off, lim) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
        return true
      }
      jtok.tokenize(utf8.buffer(src), {off: off, lim: lim}, cb)
      return hector.arg(0)
    }
  )
})

test('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',            'exp' ],

      // unexpected bytes
      [ '0*',               [ 'B@0', 'N1@0', '!1@1: unexpected byte "*", after value at 1' ] ],
      [ '{"a":3^6}',        [ 'B@0', '{@0', 'K3@1:N1@5', '!1@6: unexpected byte "^", in object after value at 6' ] ],
      [ ' 1f',              [ 'B@0', 'N1@1', '!1@2: unexpected byte "f", after value at 2' ] ],
      [ '1,2n',             [ 'B@0', 'N1@0', 'N1@2', '!1@3: unexpected byte "n", after value at 3' ] ],

      // unexpected values
      [ '"a""b"',           [ 'B@0', 'S3@0', '!3@3: unexpected string "b", after value at 3..5' ] ],
      [ '{"a""b"}',         [ 'B@0', '{@0', 'K3@1:!3@4: unexpected string "b", in object after key at 4..6' ] ],
      [ '{"a"::',           [ 'B@0', '{@0', 'K3@1:!1@5: unexpected token ":", in object before value at 5' ] ],
      [ '0{',               [ 'B@0', 'N1@0', '!1@1: unexpected token "{", after value at 1' ] ],
      [ '{ false:',         [ 'B@0', '{@0', '!5@2: unexpected token "false", in object before first key at 2..6' ] ],
      [ '{ fal',            [ 'B@0', '{@0', '!3@2: unexpected token "fal", in object before first key at 2..4' ] ],
      [ '{ fal:',           [ 'B@0', '{@0', '!3@2: unexpected token "fal", in object before first key at 2..4' ] ],
      [ '{"a": "b", 3: 4}', [ 'B@0', '{@0', 'K3@1:S3@6', '!1@11: unexpected number 3, in object before key at 11' ] ],

      // truncated values / keys
      [ 'fal',              [ 'B@0', '!3@0: truncated token, at 0..2' ] ],
      [ '"ab',              [ 'B@0', '!3@0: truncated string, at 0..2' ] ],
      [ '"ab:',             [ 'B@0', '!4@0: truncated string, at 0..3' ] ],
      [ '"\\\\\\"',         [ 'B@0', '!5@0: truncated string, at 0..4' ] ],
      [ '[3.05E-2',         [ 'B@0', '[@0', '!7@1: truncated number, at 1..7' ] ],
      [ '[3.05E-2,4.',      [ 'B@0', '[@0', 'N7@1', '!2@9: truncated number, at 9..10' ] ],
      [ '{ 2.4 ]',          [ 'B@0', '{@0', '!3@2: unexpected number 2.4, in object before first key at 2..4' ] ],
      [ '{ "a" ]',          [ 'B@0', '{@0', 'K3@2:!1@6: unexpected token "]", in object after key at 6' ] ],
      [ '{"a": t,',         [ 'B@0', '{@0', 'K3@1:!1@6: truncated token, at 6' ] ],
      [ '[ 1, 2 ] "c"',     [ 'B@0', '[@0', 'N1@2', 'N1@5', ']@7', '!3@9: unexpected string "c", after value at 9..11' ] ],
      // unexpected token has precidence over truncation (be relatively optimistic about truncation)
      [ '[ 1, 2 ] "c',      [ 'B@0', '[@0', 'N1@2', 'N1@5', ']@7', '!2@9: unexpected string "c, after value at 9..10' ] ],
      [ '{"a',              [ 'B@0', '{@0', '!2@1: truncated string, at 1..2' ] ],

      // truncated src (not an error in incremental mode)
      [ '{"a" : ',          [ 'B@0', '{@0', 'K3@1:!0@7: truncated input, in object before value at 7' ] ],
      [ '{"a"',             [ 'B@0', '{@0', 'K3@1:!0@4: truncated input, in object after key at 4' ] ],
      [ '{"a" ',            [ 'B@0', '{@0', 'K3@1:!0@5: truncated input, in object after key at 5' ] ],
      [ '[1, 2, ',          [ 'B@0', '[@0', 'N1@1', 'N1@4', '!0@7: truncated input, in array before value at 7' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
        return true
      }
      jtok.tokenize(utf8.buffer(src), null, cb)
      return hector.arg(0)
    }
  )
})

test('callback stop', function (t) {
  t.table_assert(
    [
      [ 'src',                          'at',    'ret',   'exp' ],
      [ '{ "a": 7, "b": 4 }',           0,        false,  [ 'B@0', 'E@0' ] ],
      [ '{ "a": 7, "b": 4 }',           1,        false,  [ 'B@0', '{@0' ] ],
      [ '{ "a": 7, "b": 4 }',           2,        false,  [ 'B@0', '{@0', 'K3@2:N1@7' ] ],
      [ '{ "a": 7, "b": 4 }',           3,        false,  [ 'B@0', '{@0', 'K3@2:N1@7', 'K3@10:N1@15' ] ],
      [ '{ "a": 7, "b": 4 }',           4,        false,  [ 'B@0', '{@0', 'K3@2:N1@7', 'K3@10:N1@15', '}@17', 'E@18' ] ],
      [ '{ "a": 7, "b": 4 }',           5,        false,  [ 'B@0', '{@0', 'K3@2:N1@7', 'K3@10:N1@15', '}@17', 'E@18' ] ],
    ],
    function (src, at_tok, ret) {
      var count = 0
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
        return (count++ === at_tok) ? ret : true
      }
      jtok.tokenize(utf8.buffer(src), null, cb)
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

test('incremental state',         function (t) {
  t.table_assert(
    [
      [ 'input',                    'exp' ],
      [ '',                         [ [ 'B@0', 'E@0' ],                       null ] ],
      [ '"abc"',                    [ [ 'B@0', 'S5@0', 'E@5' ],               null ] ],
      [ '[ 83 ]',                   [ [ 'N2@2', ']@5', 'E@6' ],               null ] ],
      [ '[ 83, "a" ]',              [ [ 'S3@6', ']@10', 'E@11' ],             null ] ],
      [ '3.23e12',                  [ [ 'B@0', 'N7@0', 'E@7' ],               null ] ],
      [ '{ "a": 3 }',               [ [ 'K3@2:N1@7', '}@9', 'E@10' ],         null ] ],
      [ '{ "a": 3, "b": 8 }',       [ [ 'K3@10:N1@15', '}@17', 'E@18' ],      null ] ],
      [ '{ "a": 3, "b": [1,2] }',   [ [ ']@19', '}@21', 'E@22' ],             null ] ],
      [ 'null',                     [ [ 'B@0', 'n@0', 'E@4' ],                null ] ],
      [ ' 7E4 ',                    [ [ 'B@0', 'N3@1', 'E@5' ],               null ] ],
      [ '"abc", ',                  [ [ 'B@0', 'S5@0', 'E@7' ],               { idx: 7,  state: B_V,        stack: [] } ] ],
      [ '[',                        [ [ 'B@0', '[@0', 'E@1' ],                { idx: 1,  state: ARR|BFV,    stack: [ 91 ] } ] ],
      [ '[ 83 ',                    [ [ '[@0', 'N2@2', 'E@5' ],               { idx: 5,  state: ARR|A_V,    stack: [ 91 ] } ] ],
      [ '[ 83,',                    [ [ '[@0', 'N2@2', 'E@5' ],               { idx: 5,  state: ARR|B_V,    stack: [ 91 ] } ] ],
      [ '[ 83, "a"',                [ [ 'N2@2', 'S3@6', 'E@9' ],              { idx: 9,  state: ARR|A_V,    stack: [ 91 ] } ] ],
      [ '[ 83, "a",',               [ [ 'N2@2', 'S3@6', 'E@10' ],             { idx: 10, state: ARR|B_V,    stack: [ 91 ] } ] ],
      [ '{',                        [ [ 'B@0', '{@0', 'E@1' ],                { idx: 1,  state: OBJ|BFK,    stack: [ 123 ] } ] ],
      [ '{ "a"',                    [ [ 'B@0', '{@0', 'K3@2:E@5' ],           { idx: 5,  state: OBJ|A_K,    stack: [ 123 ] } ] ],
      [ '{ "a":',                   [ [ 'B@0', '{@0', 'K3@2:E@6' ],           { idx: 6,  state: OBJ|B_V,    stack: [ 123 ] } ] ],
      [ '{ "a": 9',                 [ [ 'B@0', '{@0', 'K3@2:E@7' ],           { idx: 8,  state: OBJ|B_V,    stack: [ 123 ] } ] ],
      [ '{ "a": 93, ',              [ [ '{@0', 'K3@2:N2@7', 'E@11' ],         { idx: 11, state: OBJ|B_K,    stack: [ 123 ] } ] ],
      [ '{ "a": 93, "b',            [ [ '{@0', 'K3@2:N2@7', 'E@11' ],         { idx: 13, state: OBJ|B_K,    stack: [ 123 ] } ] ],
      [ '{ "a": 93, "b"',           [ [ '{@0', 'K3@2:N2@7', 'K3@11:E@14' ],   { idx: 14, state: OBJ|A_K,    stack: [ 123 ] } ] ],
      [ '{ "a": 93, "b":',          [ [ '{@0', 'K3@2:N2@7', 'K3@11:E@15' ],   { idx: 15, state: OBJ|B_V,    stack: [ 123 ] } ] ],
      [ '{ "a": 93, "b": [',        [ [ 'K3@2:N2@7', 'K3@11:[@16', 'E@17' ],  { idx: 17, state: ARR|BFV,    stack: [ 123, 91 ] } ] ],
    ],
    function (src) {
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(jtok.args2str(koff, klim, tok, voff, vlim, info))
        return true
      }
      var info = jtok.tokenize(utf8.buffer(src), {incremental: true}, cb)
      if (info !== null ) {
        info = qbobj.select(info, ['idx', 'state', 'stack'])
      }
      return [ hector.arg(0).slice(-3), info ]       // assert the last 3 calls plus return value
    }
  )
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