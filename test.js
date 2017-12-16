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
//     's4@0' means String, length 4 bytes, at offset zero.  (length includes the quotes).
//     'k3@1' means Key, length 3 bytes, at offset 1
//     'd3@5' means Number, length 3 bytes, at offset 5
//     'n@9'  means null at offset 9                         (null length is always 4 bytes)
//     't@23' means true at offset 23 ...
test('tokenize', function (t) {
  t.tableAssert(
    [
      [ 'src',                                      'off', 'lim', 'exp'                                             ],
      [ '',                                         0,     null,  [ '(@0,)@0', 'DONE', '0/0:0/-' ] ],
      [ '1',                                        0,     null,  [ '(@0,d1@0,)@1', 'DONE', '0/1:1/.' ] ],
      [ '1,2,3',                                    0,     null,  [ 'd1@2,d1@4,)@5', 'DONE', '2/5:5/.' ] ],
      [ '[1, 2], 3',                                0,     null,  [ ']@5,d1@8,)@9', 'DONE', '3/9:9/.' ]         ],
      [ '"x"',                                      0,     null,  [ '(@0,s3@0,)@3', 'DONE', '1/3:3/.' ]         ],
      [ '-3.05',                                    0,     null,  [ '(@0,d5@0,)@5', 'DONE', '0/5:5/.' ]         ],
      [ '-3.05',                                    1,     null,  [ '(@1,d4@1,)@5', 'DONE', '0/4:4/.' ]         ],
      [ '  true',                                   0,     null,  [ '(@0,t@2,)@6', 'DONE', '1/6:6/.' ]          ],
      [ ' false  ',                                 0,     null,  [ '(@0,f@1,)@8', 'DONE', '1/8:8/.' ]          ],
      [ ' false   ',                                1,     null,  [ '(@1,f@1,)@9', 'DONE', '1/8:8/.' ]          ],
      [ '[1, 2, 3]',                                0,     null,  [ 'd1@7,]@8,)@9', 'DONE', '4/9:9/.' ]         ],
      [ '[3.05E-2]',                                0,     null,  [ 'd7@1,]@8,)@9', 'DONE', '2/9:9/.' ]         ],
      [ '[3.05E-2]',                                4,     5,     [ '(@4,d1@4,)@5', 'DONE', '0/1:1/.' ]         ],
      [ '{"a":1}',                                  0,     null,  [ 'k3@1:d1@5,}@6,)@7', 'DONE', '2/7:7/.' ]    ],
      [ '{"a"  :1}',                                0,     null,  [ 'k3@1:d1@7,}@8,)@9', 'DONE', '2/9:9/.' ]    ],
      [ '{ "a" : 1 }',                              0,     null,  [ 'k3@2:d1@8,}@10,)@11', 'DONE', '2/11:11/.' ] ],
      [ '"\\""',                                    0,     null,  [ '(@0,s4@0,)@4', 'DONE', '1/4:4/.' ]         ],
      [ '"\\\\"',                                   0,     null,  [ '(@0,s4@0,)@4', 'DONE', '1/4:4/.' ]         ],
      [ '\t\t"x\\a\r"  ',                           0,     null,  [ '(@0,s6@2,)@10', 'DONE', '1/10:10/.' ]       ],
      [ '"\\"x\\"a\r\\""',                          0,     null,  [ '(@0,s11@0,)@11', 'DONE', '1/11:11/.' ]      ],
      [ ' [0,1,2]',                                 0,     null,  [ 'd1@6,]@7,)@8', 'DONE', '4/8:8/.' ]         ],
      [ '["a", "bb"] ',                             0,     null,  [ 's4@6,]@10,)@12', 'DONE', '3/12:12/.' ]      ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null,  null,  [ 't@23,f@29,)@34', 'DONE', '6/34:34/.' ]      ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null,  null,  [ '}@30,]@34,)@35', 'DONE', '7/35:35/.' ]      ],
    ],
    function (input, off, lim) {
      var hector = t.hector()
      var endinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.ERR) {
          err('callback got error: ' + pstate.str(info) + ' input: ' + input + (off > 0 ? 'off: ' + off : '')) }
        if (tok === TOK.END) { endinfo = info }
        return true
      }
      var info = jtok.tokenize(utf8.buffer(input), {off: off, lim: lim}, cb)
      info === endinfo || err('expected returned info to equal endinfo')

      return [ hector.arg(0).slice(-3).join(','), info.ecode, pstate.str(info) ]
    }
  )
})

test('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',            'exp' ],

      // truncated values / keys (not an error in incremental mode)
      [ 'fal',              [ '(@0,!3@0: truncated token, first value at 0..2', 'TRUNC_VAL', '0/3:3/3' ]                            ],
      [ '"ab',              [ '(@0,!3@0: truncated string, first value at 0..2', 'TRUNC_VAL', '0/3:3/3' ]                           ],
      [ '"ab:',             [ '(@0,!4@0: truncated string, first value at 0..3', 'TRUNC_VAL', '0/4:4/4' ]                           ],
      [ '"\\\\\\"',         [ '(@0,!5@0: truncated string, first value at 0..4', 'TRUNC_VAL', '0/5:5/5' ]                           ],
      [ '[3.05E-2',         [ '(@0,[@0,!7@1: truncated decimal, in array first value at 1..7', 'TRUNC_VAL', '0/8:8/[7' ]              ],
      [ '[3.05E-2,4.',      [ '[@0,d7@1,!2@9: truncated decimal, in array value at 9..10', 'TRUNC_VAL', '1/11:11/[2' ]                 ],
      [ '{"a',              [ '(@0,{@0,!2@1: truncated key, in object first key at 1..2', 'TRUNC_KEY', '0/3:3/{2' ]               ],

      // unexpected byte (single)
      [ '0*',               [ '(@0,d1@0,!1@1: unexpected byte "*", after value at 1', 89, '1/2:2/.' ]                      ],
      [ '{"a":3^6}',        [ '{@0,k3@1:d1@5,!1@6: unexpected byte "^", in object after value at 6', 89, '1/7:9/{.' ]       ],

      // unexpected byte (in multi-byte number or token)
      [ '1,2.4n',           [ '(@0,d1@0,!4@2: illegal decimal "2.4n", value at 2..5', 89, '1/6:6/4' ]                     ],
      [ '{"a": t,',         [ '(@0,{@0,k3@1:!2@6: illegal token "t,", in object value at 6..7', 89, '0/8:8/{3.1:2' ]                  ],
      [ ' 1f',              [ '(@0,!2@1: illegal decimal "1f", first value at 1..2', 89, '0/3:3/2' ]                      ],

      // unexpected values
      [ '"a""b"',           [ '(@0,s3@0,!3@3: unexpected string "b", after value at 3..5', 84, '1/6:6/.' ]                  ],
      [ '{"a""b"}',         [ '(@0,{@0,k3@1:!3@4: unexpected string "b", in object after key at 4..6', 84, '0/7:8/{3.' ]      ],
      [ '{"a"::',           [ '(@0,{@0,k3@1:!1@5: unexpected token ":", in object before value at 5', 84, '0/6:6/{3:' ]       ],
      [ '0{',               [ '(@0,d1@0,!1@1: unexpected token "{", after value at 1', 84, '1/2:2/.' ]                      ],
      [ '{ false:',         [ '(@0,{@0,!5@2: unexpected token "false", in object before first key at 2..6', 84, '0/7:8/{-' ] ],
      [ '{ fal',            [ '(@0,{@0,!3@2: unexpected token "fal", in object before first key at 2..4', 84, '0/5:5/{-' ]   ],
      [ '{ fal:',           [ '(@0,{@0,!3@2: unexpected token "fal", in object before first key at 2..4', 84, '0/5:6/{-' ]   ],
      [ '{"a": "b", 3: 4}', [ '{@0,k3@1:s3@6,!1@11: unexpected decimal 3, in object before key at 11', 84, '1/12:16/{+' ]      ],
      [ '{ 2.4 ]',          [ '(@0,{@0,!3@2: unexpected decimal 2.4, in object before first key at 2..4', 84, '0/5:7/{-' ]    ],
      [ '{ "a" ]',          [ '(@0,{@0,k3@2:!1@6: unexpected token "]", in object after key at 6', 84, '0/7:7/{3.1.' ]          ],
      // unexpected token has precidence over truncation (be relatively optimistic about truncation)
      [ '[ 1, 2 ] "c',      [ 'd1@5,]@7,!2@9: unexpected string "c, after value at 9..10', 84, '3/11:11/.' ]                 ],
      [ '[ 1, 2 ] "c"',     [ 'd1@5,]@7,!3@9: unexpected string "c", after value at 9..11', 84, '3/12:12/.' ]                ],

      // truncated src (not an error in incremental mode)
      [ '{"a" : ',          [ '(@0,{@0,k3@1:!@7: truncated input, in object before value at 7', 'TRUNC_SRC', '0/7:7/{3.2:' ]            ],
      [ '{"a"',             [ '(@0,{@0,k3@1:!@4: truncated input, in object after key at 4', 'TRUNC_SRC', '0/4:4/{3.' ]               ],
      [ '{"a" ',            [ '(@0,{@0,k3@1:!@5: truncated input, in object after key at 5', 'TRUNC_SRC', '0/5:5/{3.1.' ]             ],
      [ '[1, 2, ',          [ 'd1@1,d1@4,!@7: truncated input, in array before value at 7', 'TRUNC_SRC', '2/7:7/[+' ]                ],
    ],
    function (src) {
      var hector = t.hector()
      var errinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.END) {
          err('error should not create an END callback') }
        if (tok === TOK.ERR) { errinfo = info }
        return true
      }
      // jtok.tokenize(utf8.buffer(src), null, cb)
      try {
        jtok.tokenize(utf8.buffer(src), null, cb)
      } catch (e) {
        e.info === errinfo || err('this is not the error you are looking for: ' + e)
        return [ hector.arg(0).slice(-3).join(','), e.info.ecode, pstate.str(e.info) ]
      }
    }
  )
})

test('callback stop', function (t) {
  t.table_assert(
    [
      [ 'src',                'at_cb', 'ret', 'exp' ],
      [ '{ "a": 7, "b": 4 }', 0,       false, [ '(@0',                        'CLEAN_STOP', '0/0:18/-' ] ],
      [ '{ "a": 7, "b": 4 }', 1,       false, [ '(@0,{@0',                    'TRUNC_SRC',  '0/1:18/{-' ] ],
      [ '{ "a": 7, "b": 4 }', 2,       false, [ '(@0,{@0,k3@2:d1@7',          'TRUNC_SRC',  '1/8:18/{.' ] ],
      [ '{ "a": 7, "b": 4 }', 3,       false, [ '{@0,k3@2:d1@7,k3@10:d1@15',  'TRUNC_SRC',  '2/16:18/{.' ] ],
      // note that if callback returns false when parsing is done the info still has a DONE code (but no END callback).
      [ '{ "a": 7, "b": 4 }', 4,       false, [ 'k3@2:d1@7,k3@10:d1@15,}@17', 'DONE',       '3/18:18/.' ] ],
    ],
    function (src, at_cb, ret) {
      var count = 0
      var hector = t.hector()
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.END) { err('stopped callback should not call end') }
        return (count++ === at_cb) ? ret : true
      }
      var info = jtok.tokenize(utf8.buffer(src), {incremental: true}, cb)
      return [ hector.arg(0).slice(-3).join(','), info.ecode, pstate.str(info) ]
    }
  )
})

// completed parsing returns null and TOK.END callback info is null.
test('incremental clean',         function (t) {
  t.table_assert(
    [
      [ 'input',                  'exp'                                        ],
      [ '',                       [ '(@0,)@0',                'DONE', '0/0:0/-' ] ],
      [ '3.23e12',                [ '(@0,d7@0,)@7',           'DONE', '0/7:7/.' ] ],
      [ '"abc"',                  [ '(@0,s5@0,)@5',           'DONE', '1/5:5/.' ] ],
      [ '[ 83 ]',                 [ 'd2@2,]@5,)@6',           'DONE', '2/6:6/.' ] ],
      [ '[ 83, "a" ]',            [ 's3@6,]@10,)@11',         'DONE', '3/11:11/.' ] ],
      [ '{ "a": 3 }',             [ 'k3@2:d1@7,}@9,)@10',     'DONE', '2/10:10/.' ] ],
      [ '{ "a": 3, "b": 8 }',     [ 'k3@10:d1@15,}@17,)@18',  'DONE', '3/18:18/.' ] ],
      [ '{ "a": 3, "b": [1,2] }', [ ']@19,}@21,)@22',         'DONE', '5/22:22/.' ] ],
      [ 'null',                   [ '(@0,n@0,)@4',            'DONE', '1/4:4/.' ] ],
      [ ' 7E4 ',                  [ '(@0,d3@1,)@5',           'DONE', '1/5:5/.' ] ],
      [ '{ "a": 93, "b": [] }',   [ ']@17,}@19,)@20',         'DONE', '3/20:20/.' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var endinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.END) { endinfo = info }
        return true
      }
      var info = jtok.tokenize(utf8.buffer(src), {incremental: true}, cb)
      info === endinfo || err('expected returned info to equal endinfo')

      return [ hector.arg(0).slice(-3).join(','), info.ecode, pstate.str(info) ]
    }
  )
})

test('incremental', function (t) {
  t.table_assert(
    [
      [ 'input'              ,  'exp' ],
      [ '"abc", '            ,  [ '(@0,s5@0,)@7',              'TRUNC_SRC', '1/7:7/+' ] ],
      [ '['                  ,  [ '(@0,[@0,)@1',               'TRUNC_SRC', '0/1:1/[-' ] ],
      [ '[ 83 '              ,  [ '[@0,d2@2,)@5',              'TRUNC_SRC', '1/5:5/[.' ] ],
      [ '[ 83 ,'             ,  [ '[@0,d2@2,)@6',              'TRUNC_SRC', '1/6:6/[+' ] ],
      [ '[ 83 , "a"'         ,  [ 'd2@2,s3@7,)@10',            'TRUNC_SRC', '2/10:10/[.' ] ],
      [ '[ 83 , "a",'        ,  [ 'd2@2,s3@7,)@11',            'TRUNC_SRC', '2/11:11/[+' ] ],
      [ '[ 83 , "a", 2'      ,  [ 'd2@2,s3@7,)1@12',           'TRUNC_VAL', '2/13:13/[1' ] ],
      [ '{'                  ,  [ '(@0,{@0,)@1',               'TRUNC_SRC', '0/1:1/{-' ] ],
      [ '{ "a"'              ,  [ '(@0,{@0,k3@2:)@5',          'TRUNC_SRC', '0/5:5/{3.' ] ],
      [ '{ "a":'             ,  [ '(@0,{@0,k3@2:)@6',          'TRUNC_SRC', '0/6:6/{3:' ] ],
      [ '{ "a": 9'           ,  [ '(@0,{@0,k3@2:)1@7',         'TRUNC_VAL', '0/8:8/{3.1:1' ] ],
      [ '{ "a": 93, '        ,  [ '{@0,k3@2:d2@7,)@11',        'TRUNC_SRC', '1/11:11/{+' ] ],
      [ '{ "a": 93, "b'      ,  [ '{@0,k3@2:d2@7,)2@11',       'TRUNC_KEY', '1/13:13/{2' ] ],
      [ '{ "a": 93, "b"'     ,  [ '{@0,k3@2:d2@7,k3@11:)@14',  'TRUNC_SRC', '1/14:14/{3.' ] ],
      [ '{ "a": 93, "b":'    ,  [ '{@0,k3@2:d2@7,k3@11:)@15',  'TRUNC_SRC', '1/15:15/{3:' ] ],
      [ '{ "a": 93, "b": ['  ,  [ 'k3@2:d2@7,k3@11:[@16,)@17', 'TRUNC_SRC', '1/17:17/{[-' ] ],
      [ '{ "a": 93, "b": []' ,  [ 'k3@11:[@16,]@17,)@18',      'TRUNC_SRC', '2/18:18/{.' ] ],
      [ '{ "a": 93, "b": [] ',  [ 'k3@11:[@16,]@17,)@19',      'TRUNC_SRC', '2/19:19/{.' ] ],
      [ '{ "a": 93, "b": [] }', [ ']@17,}@19,)@20',            'DONE', '3/20:20/.' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var endinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.END) { endinfo = info }
        return true
      }
      var info = jtok.tokenize(utf8.buffer(src), {incremental: true}, cb)
      info === endinfo || err('expected returned info to equal endinfo')

      return [ hector.arg(0).slice(-3).join(','), info.ecode, pstate.str(info) ]
    }
  )
})

function err (msg) { throw Error(msg) }

/*

function err (msg) { throw Error(msg) }
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
    var cb = function (src, koff, klim, tok, voff, vlim, info) {
      hector(pstate.args2str(koff, klim, tok, voff, vlim, info))
      return true
    }
    jtok.tokenize(utf8.buffer(input), { off: off, lim: lim, init: { state: state, stack: stack, err: err } }, cb)
    return hector.arg(0)
  })
})
/*
test('incremental processing', function (t) {
  t.table_assert([
    [ 'inputs',                         'exp' ],
    [ ['"ab',    'c"' ],                [] ],
    // [ ['{ "a": ', '23 }']],
  ], function (inputs) {
    var opt = {incremental: 1, init: null}
    var hector = t.hector()
    var cb = function (src, koff, klim, tok, voff, vlim, info) {
      hector(pstate.args2str(koff, klim, tok, voff, vlim, info))
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