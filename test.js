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
//     'S4@0' means String, length 4 bytes, at offset zero.  (length includes the quotes).
//     'K3@1' means Key, length 3 bytes, at offset 1
//     'N3@5' means Number, length 3 bytes, at offset 5
//     'n@9'  means null at offset 9                         (null length is always 4 bytes)
//     't@23' means true at offset 23 ...
test('tokenize', function (t) {
  t.tableAssert(
    [
      [ 'src',                                      'off', 'lim', 'exp'                                             ],
      [ '',                                         0,     null,  [ 'B@0,E@0', 'DONE', '0/0:0/-' ] ],
      [ '1',                                        0,     null,  [ 'B@0,N1@0,E@1', 'DONE', '0/1:1/.' ] ],
      [ '1,2,3',                                    0,     null,  [ 'N1@2,N1@4,E@5', 'DONE', '2/5:5/.' ] ],
      [ '[1, 2], 3',                                0,     null,  [ ']@5,N1@8,E@9', 'DONE', '3/9:9/.' ]         ],
      [ '"x"',                                      0,     null,  [ 'B@0,S3@0,E@3', 'DONE', '1/3:3/.' ]         ],
      [ '-3.05',                                    0,     null,  [ 'B@0,N5@0,E@5', 'DONE', '0/5:5/.' ]         ],
      [ '-3.05',                                    1,     null,  [ 'B@1,N4@1,E@5', 'DONE', '0/4:4/.' ]         ],
      [ '  true',                                   0,     null,  [ 'B@0,t@2,E@6', 'DONE', '1/6:6/.' ]          ],
      [ ' false  ',                                 0,     null,  [ 'B@0,f@1,E@8', 'DONE', '1/8:8/.' ]          ],
      [ ' false   ',                                1,     null,  [ 'B@1,f@1,E@9', 'DONE', '1/8:8/.' ]          ],
      [ '[1, 2, 3]',                                0,     null,  [ 'N1@7,]@8,E@9', 'DONE', '4/9:9/.' ]         ],
      [ '[3.05E-2]',                                0,     null,  [ 'N7@1,]@8,E@9', 'DONE', '2/9:9/.' ]         ],
      [ '[3.05E-2]',                                4,     5,     [ 'B@4,N1@4,E@5', 'DONE', '0/1:1/.' ]         ],
      [ '{"a":1}',                                  0,     null,  [ 'K3@1:N1@5,}@6,E@7', 'DONE', '2/7:7/.' ]    ],
      [ '{"a"  :1}',                                0,     null,  [ 'K3@1:N1@7,}@8,E@9', 'DONE', '2/9:9/.' ]    ],
      [ '{ "a" : 1 }',                              0,     null,  [ 'K3@2:N1@8,}@10,E@11', 'DONE', '2/11:11/.' ] ],
      [ '"\\""',                                    0,     null,  [ 'B@0,S4@0,E@4', 'DONE', '1/4:4/.' ]         ],
      [ '"\\\\"',                                   0,     null,  [ 'B@0,S4@0,E@4', 'DONE', '1/4:4/.' ]         ],
      [ '\t\t"x\\a\r"  ',                           0,     null,  [ 'B@0,S6@2,E@10', 'DONE', '1/10:10/.' ]       ],
      [ '"\\"x\\"a\r\\""',                          0,     null,  [ 'B@0,S11@0,E@11', 'DONE', '1/11:11/.' ]      ],
      [ ' [0,1,2]',                                 0,     null,  [ 'N1@6,]@7,E@8', 'DONE', '4/8:8/.' ]         ],
      [ '["a", "bb"] ',                             0,     null,  [ 'S4@6,]@10,E@12', 'DONE', '3/12:12/.' ]      ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null,  null,  [ 't@23,f@29,E@34', 'DONE', '6/34:34/.' ]      ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null,  null,  [ '}@30,]@34,E@35', 'DONE', '7/35:35/.' ]      ],
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
      [ 'fal',              [ 'B@0,!3@0: truncated token, first value at 0..2', 'TRUNC_VAL', '0/3:3/3' ]                            ],
      [ '"ab',              [ 'B@0,!3@0: truncated string, first value at 0..2', 'TRUNC_VAL', '0/3:3/3' ]                           ],
      [ '"ab:',             [ 'B@0,!4@0: truncated string, first value at 0..3', 'TRUNC_VAL', '0/4:4/4' ]                           ],
      [ '"\\\\\\"',         [ 'B@0,!5@0: truncated string, first value at 0..4', 'TRUNC_VAL', '0/5:5/5' ]                           ],
      [ '[3.05E-2',         [ 'B@0,[@0,!7@1: truncated decimal, in array first value at 1..7', 'TRUNC_VAL', '0/8:8/[7' ]              ],
      [ '[3.05E-2,4.',      [ '[@0,N7@1,!2@9: truncated decimal, in array value at 9..10', 'TRUNC_VAL', '1/11:11/[2' ]                 ],
      [ '{"a": t,',         [ 'B@0,{@0,K3@1:!1@6: truncated token, in object value at 6', 'TRUNC_VAL', '0/7:8/{3.1:1' ]                  ],
      [ '{"a',              [ 'B@0,{@0,!2@1: truncated key, in object first key at 1..2', 'TRUNC_KEY', '0/3:3/{2' ]               ],

      // unexpected bytes
      [ '0*',               [ 'B@0,N1@0,!1@1: unexpected byte "*", after value at 1', 'UNEXP_BYTE', '1/2:2/.' ]                      ],
      [ '{"a":3^6}',        [ '{@0,K3@1:N1@5,!1@6: unexpected byte "^", in object after value at 6', 'UNEXP_BYTE', '1/7:9/{.' ]       ],
      [ ' 1f',              [ 'B@0,N1@1,!1@2: unexpected byte "f", after value at 2', 'UNEXP_BYTE', '1/3:3/.' ]                      ],
      [ '1,2n',             [ 'N1@0,N1@2,!1@3: unexpected byte "n", after value at 3', 'UNEXP_BYTE', '2/4:4/.' ]                     ],

      // unexpected values
      [ '"a""b"',           [ 'B@0,S3@0,!3@3: unexpected string "b", after value at 3..5', 'UNEXP_VAL', '1/6:6/.' ]                  ],
      [ '{"a""b"}',         [ 'B@0,{@0,K3@1:!3@4: unexpected string "b", in object after key at 4..6', 'UNEXP_VAL', '0/7:8/{3.' ]      ],
      [ '{"a"::',           [ 'B@0,{@0,K3@1:!1@5: unexpected token ":", in object before value at 5', 'UNEXP_VAL', '0/6:6/{3:' ]       ],
      [ '0{',               [ 'B@0,N1@0,!1@1: unexpected token "{", after value at 1', 'UNEXP_VAL', '1/2:2/.' ]                      ],
      [ '{ false:',         [ 'B@0,{@0,!5@2: unexpected token "false", in object before first key at 2..6', 'UNEXP_VAL', '0/7:8/{-' ] ],
      [ '{ fal',            [ 'B@0,{@0,!3@2: unexpected token "fal", in object before first key at 2..4', 'UNEXP_VAL', '0/5:5/{-' ]   ],
      [ '{ fal:',           [ 'B@0,{@0,!3@2: unexpected token "fal", in object before first key at 2..4', 'UNEXP_VAL', '0/5:6/{-' ]   ],
      [ '{"a": "b", 3: 4}', [ '{@0,K3@1:S3@6,!1@11: unexpected decimal 3, in object before key at 11', 'UNEXP_VAL', '1/12:16/{+' ]      ],
      [ '{ 2.4 ]',          [ 'B@0,{@0,!3@2: unexpected decimal 2.4, in object before first key at 2..4', 'UNEXP_VAL', '0/5:7/{-' ]    ],
      [ '{ "a" ]',          [ 'B@0,{@0,K3@2:!1@6: unexpected token "]", in object after key at 6', 'UNEXP_VAL', '0/7:7/{3.1.' ]          ],
      // unexpected token has precidence over truncation (be relatively optimistic about truncation)
      [ '[ 1, 2 ] "c',      [ 'N1@5,]@7,!2@9: unexpected string "c, after value at 9..10', 'UNEXP_VAL', '3/11:11/.' ]                 ],
      [ '[ 1, 2 ] "c"',     [ 'N1@5,]@7,!3@9: unexpected string "c", after value at 9..11', 'UNEXP_VAL', '3/12:12/.' ]                ],

      // truncated src (not an error in incremental mode)
      [ '{"a" : ',          [ 'B@0,{@0,K3@1:!0@7: truncated input, in object before value at 7', 'TRUNC_SRC', '0/7:7/{3.2:' ]            ],
      [ '{"a"',             [ 'B@0,{@0,K3@1:!0@4: truncated input, in object after key at 4', 'TRUNC_SRC', '0/4:4/{3.' ]               ],
      [ '{"a" ',            [ 'B@0,{@0,K3@1:!0@5: truncated input, in object after key at 5', 'TRUNC_SRC', '0/5:5/{3.1.' ]             ],
      [ '[1, 2, ',          [ 'N1@1,N1@4,!0@7: truncated input, in array before value at 7', 'TRUNC_SRC', '2/7:7/[+' ]                ],
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
      [ '{ "a": 7, "b": 4 }', 0,       false, [ 'B@0',                        'CLEAN_STOP', '0/0:18/-' ] ],
      [ '{ "a": 7, "b": 4 }', 1,       false, [ 'B@0,{@0',                    'TRUNC_SRC',  '0/1:18/{-' ] ],
      [ '{ "a": 7, "b": 4 }', 2,       false, [ 'B@0,{@0,K3@2:N1@7',          'TRUNC_SRC',  '1/8:18/{.' ] ],
      [ '{ "a": 7, "b": 4 }', 3,       false, [ '{@0,K3@2:N1@7,K3@10:N1@15',  'TRUNC_SRC',  '2/16:18/{.' ] ],
      // note that if callback returns false when parsing is done the info still has a DONE code (but no END callback).
      [ '{ "a": 7, "b": 4 }', 4,       false, [ 'K3@2:N1@7,K3@10:N1@15,}@17', 'DONE',       '3/18:18/.' ] ],
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
      [ '',                       [ 'B@0,E@0',                'DONE', '0/0:0/-' ] ],
      [ '3.23e12',                [ 'B@0,N7@0,E@7',           'DONE', '0/7:7/.' ] ],
      [ '"abc"',                  [ 'B@0,S5@0,E@5',           'DONE', '1/5:5/.' ] ],
      [ '[ 83 ]',                 [ 'N2@2,]@5,E@6',           'DONE', '2/6:6/.' ] ],
      [ '[ 83, "a" ]',            [ 'S3@6,]@10,E@11',         'DONE', '3/11:11/.' ] ],
      [ '{ "a": 3 }',             [ 'K3@2:N1@7,}@9,E@10',     'DONE', '2/10:10/.' ] ],
      [ '{ "a": 3, "b": 8 }',     [ 'K3@10:N1@15,}@17,E@18',  'DONE', '3/18:18/.' ] ],
      [ '{ "a": 3, "b": [1,2] }', [ ']@19,}@21,E@22',         'DONE', '5/22:22/.' ] ],
      [ 'null',                   [ 'B@0,n@0,E@4',            'DONE', '1/4:4/.' ] ],
      [ ' 7E4 ',                  [ 'B@0,N3@1,E@5',           'DONE', '1/5:5/.' ] ],
      [ '{ "a": 93, "b": [] }',   [ ']@17,}@19,E@20',         'DONE', '3/20:20/.' ] ],
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
      [ '"abc", '            ,  [ 'B@0,S5@0,E@7',              'TRUNC_SRC', '1/7:7/+' ] ],
      [ '['                  ,  [ 'B@0,[@0,E@1',               'TRUNC_SRC', '0/1:1/[-' ] ],
      [ '[ 83 '              ,  [ '[@0,N2@2,E@5',              'TRUNC_SRC', '1/5:5/[.' ] ],
      [ '[ 83 ,'             ,  [ '[@0,N2@2,E@6',              'TRUNC_SRC', '1/6:6/[+' ] ],
      [ '[ 83 , "a"'         ,  [ 'N2@2,S3@7,E@10',            'TRUNC_SRC', '2/10:10/[.' ] ],
      [ '[ 83 , "a",'        ,  [ 'N2@2,S3@7,E@11',            'TRUNC_SRC', '2/11:11/[+' ] ],
      [ '[ 83 , "a", 2'      ,  [ 'N2@2,S3@7,E1@12',           'TRUNC_VAL', '2/13:13/[1' ] ],
      [ '{'                  ,  [ 'B@0,{@0,E@1',               'TRUNC_SRC', '0/1:1/{-' ] ],
      [ '{ "a"'              ,  [ 'B@0,{@0,K3@2:E@5',          'TRUNC_SRC', '0/5:5/{3.' ] ],
      [ '{ "a":'             ,  [ 'B@0,{@0,K3@2:E@6',          'TRUNC_SRC', '0/6:6/{3:' ] ],
      [ '{ "a": 9'           ,  [ 'B@0,{@0,K3@2:E1@7',         'TRUNC_VAL', '0/8:8/{3.1:1' ] ],
      [ '{ "a": 93, '        ,  [ '{@0,K3@2:N2@7,E@11',        'TRUNC_SRC', '1/11:11/{+' ] ],
      [ '{ "a": 93, "b'      ,  [ '{@0,K3@2:N2@7,E2@11',       'TRUNC_KEY', '1/13:13/{2' ] ],
      [ '{ "a": 93, "b"'     ,  [ '{@0,K3@2:N2@7,K3@11:E@14',  'TRUNC_SRC', '1/14:14/{3.' ] ],
      [ '{ "a": 93, "b":'    ,  [ '{@0,K3@2:N2@7,K3@11:E@15',  'TRUNC_SRC', '1/15:15/{3:' ] ],
      [ '{ "a": 93, "b": ['  ,  [ 'K3@2:N2@7,K3@11:[@16,E@17', 'TRUNC_SRC', '1/17:17/{[-' ] ],
      [ '{ "a": 93, "b": []' ,  [ 'K3@11:[@16,]@17,E@18',      'TRUNC_SRC', '2/18:18/{.' ] ],
      [ '{ "a": 93, "b": [] ',  [ 'K3@11:[@16,]@17,E@19',      'TRUNC_SRC', '2/19:19/{.' ] ],
      [ '{ "a": 93, "b": [] }', [ ']@17,}@19,E@20',            'DONE', '3/20:20/.' ] ],
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
    [ '"abc"',        0,      null,   null,  BFV,      0,        [],     [ 'B@0', 'S5@0', 'E@5' ] ],
    [ '"a',           0,      null,   null,  BFV,      0,        [],     [ 'B@0', '!2@0: truncated string, at 0..1' ] ],
    // [ 'bc"',           0,      null,   null,  BFV,     TRUNC_vAL, [],     [ 'B@0', '!2@1: truncated string, at 1..2' ] ],
    // [ '{"a": 3.3}',     4,      null,   null,  OBJ|a_K, TRUNC_vAL, [o],     [ 'B@4', 'N3@6', '}@9', 'E@10' ] ],
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