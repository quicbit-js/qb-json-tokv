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
      // [ '',                                         0,     null,  [ '(@0,)@0', ')', '0/0:0/-' ] ],
      [ '1',                                        0,     null,  [ '(@0,d1@0,)@1', ')', '0/1:1/.' ] ],
      [ '1,2,3',                                    0,     null,  [ 'd1@2,d1@4,)@5', ')', '2/5:5/.' ] ],
      [ '[1, 2], 3',                                0,     null,  [ ']@5,d1@8,)@9', ')', '3/9:9/.' ]         ],
      [ '"x"',                                      0,     null,  [ '(@0,s3@0,)@3', ')', '1/3:3/.' ]         ],
      [ '-3.05',                                    0,     null,  [ '(@0,d5@0,)@5', ')', '0/5:5/.' ]         ],
      [ '-3.05',                                    1,     null,  [ '(@1,d4@1,)@5', ')', '0/4:4/.' ]         ],
      [ '  true',                                   0,     null,  [ '(@0,t@2,)@6', ')', '1/6:6/.' ]          ],
      [ ' false  ',                                 0,     null,  [ '(@0,f@1,)@8', ')', '1/8:8/.' ]          ],
      [ ' false   ',                                1,     null,  [ '(@1,f@1,)@9', ')', '1/8:8/.' ]          ],
      [ '[1, 2, 3]',                                0,     null,  [ 'd1@7,]@8,)@9', ')', '4/9:9/.' ]         ],
      [ '[3.05E-2]',                                0,     null,  [ 'd7@1,]@8,)@9', ')', '2/9:9/.' ]         ],
      [ '[3.05E-2]',                                4,     5,     [ '(@4,d1@4,)@5', ')', '0/1:1/.' ]         ],
      [ '{"a":1}',                                  0,     null,  [ 'k3@1:d1@5,}@6,)@7', ')', '2/7:7/.' ]    ],
      [ '{"a"  :1}',                                0,     null,  [ 'k3@1:d1@7,}@8,)@9', ')', '2/9:9/.' ]    ],
      [ '{ "a" : 1 }',                              0,     null,  [ 'k3@2:d1@8,}@10,)@11', ')', '2/11:11/.' ] ],
      [ '"\\""',                                    0,     null,  [ '(@0,s4@0,)@4', ')', '1/4:4/.' ]         ],
      [ '"\\\\"',                                   0,     null,  [ '(@0,s4@0,)@4', ')', '1/4:4/.' ]         ],
      [ '\t\t"x\\a\r"  ',                           0,     null,  [ '(@0,s6@2,)@10', ')', '1/10:10/.' ]       ],
      [ '"\\"x\\"a\r\\""',                          0,     null,  [ '(@0,s11@0,)@11', ')', '1/11:11/.' ]      ],
      [ ' [0,1,2]',                                 0,     null,  [ 'd1@6,]@7,)@8', ')', '4/8:8/.' ]         ],
      [ '["a", "bb"] ',                             0,     null,  [ 's4@6,]@10,)@12', ')', '3/12:12/.' ]      ],
      [ '"x", 4\n, null, 3.2e5 , true, false',      null,  null,  [ 't@23,f@29,)@34', ')', '6/34:34/.' ]      ],
      [ '["a",1.3,\n\t{ "b" : ["v", "w"]\n}\t\n ]', null,  null,  [ '}@30,]@34,)@35', ')', '7/35:35/.' ]      ],
    ],
    function (input, off, lim) {
      var hector = t.hector()
      var endinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (tok === TOK.DONE) { endinfo = info }
        return true
      }
      var info = jtok.tokenize(utf8.buffer(input), {off: off, lim: lim}, cb)
      info === endinfo || err('expected returned info to equal endinfo')

      return [ hector.arg(0).slice(-3).join(','), String.fromCharCode(info.tok), pstate.str(info) ]
    }
  )
})

test.only('tokenize - errors', function (t) {
  t.tableAssert(
    [
      [ 'input',            'exp' ],

      // incomplete input (not an error in incremental mode)
      [ '{"a" : ',          [ '(@0,{@0,k3@1:I@7', '0/7:7/{3.2:' ]   ],
      [ '{"a"',             [ '(@0,{@0,k3@1:I@4', '0/4:4/{3.' ]     ],
      [ '{"a" ',            [ '(@0,{@0,k3@1:I@5', '0/5:5/{3.1.' ]   ],
      [ '[1, 2, ',          [ 'd1@1,d1@4,I@7', '2/7:7/[,' ]         ],

      // truncated values / keys (not an error in incremental mode)
      [ 'fal',              [ '(@0,T3@0', '0/3:3/3' ]               ],
      [ '"ab',              [ '(@0,T3@0', '0/3:3/3' ]               ],
      [ '"ab:',             [ '(@0,T4@0', '0/4:4/4' ]               ],
      [ '"\\\\\\"',         [ '(@0,T5@0', '0/5:5/5' ]               ],
      [ '[3.05E-2',         [ '(@0,[@0,T7@1', '0/8:8/[7' ]          ],
      [ '[3.05E-2,4.',      [ '[@0,d7@1,T2@9', '1/11:11/[2' ]       ],
      [ '{"a',              [ '(@0,{@0,T2@1', '0/3:3/{2' ]          ],

      // unexpected byte in number
      [ '0*',               [ '(@0,B2@0', '0/2:2/2' ]               ],
      [ '{"a":3^6}',        [ '(@0,{@0,k3@1:B2@5', '0/7:9/{3.0:2' ] ],
      [ '1,2.4n',           [ '(@0,d1@0,B4@2', '1/6:6/4' ]          ],
      [ ' 1f',              [ '(@0,B2@1', '0/3:3/2' ]               ],

      // unexpected byte in token
      [ '{"a": t,',         [ '(@0,{@0,k3@1:B2@6', '0/8:8/{3.1:2' ] ],

      // unexpected token
      [ '"a""b"',           [ '(@0,s3@0,U3@3', '1/6:6/.' ]          ],
      [ '{"a""b"}',         [ '(@0,{@0,k3@1:U3@4', '0/7:8/{3.' ]    ],
      [ '{"a"::',           [ '(@0,{@0,k3@1:U1@5', '0/6:6/{3:' ]    ],
      [ '0{',               [ '(@0,d1@0,U1@1', '1/2:2/.' ]          ],
      [ '{ false:',         [ '(@0,{@0,U5@2', '0/7:8/{-' ]          ],
      [ '{ fal',            [ '(@0,{@0,U3@2', '0/5:5/{-' ]          ],
      [ '{ fal:',           [ '(@0,{@0,U3@2', '0/5:6/{-' ]          ],
      [ '{"a": "b", 3: 4}', [ '{@0,k3@1:s3@6,U1@11', '1/12:16/{,' ] ],
      [ '{ 2.4 ]',          [ '(@0,{@0,U3@2', '0/5:7/{-' ]          ],
      [ '{ "a" ]',          [ '(@0,{@0,k3@2:U1@6', '0/7:7/{3.1.' ]  ],
      [ '[ 1, 2 ] "c',      [ 'd1@5,]@7,U2@9', '3/11:11/.' ]        ],
      [ '[ 1, 2 ] "c"',     [ 'd1@5,]@7,U3@9', '3/12:12/.' ]        ],
    ],
    function (src) {
      var hector = t.hector()
      var errinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (info && tok !== TOK.BEG) {
          errinfo = info
        }
        return true
      }
      // jtok.tokenize(utf8.buffer(src), null, cb)
      try {
        jtok.tokenize(utf8.buffer(src), null, cb)
      } catch (e) {
        e.info === errinfo || err('this is not the error you are looking for: ' + e)
        return [ hector.arg(0).slice(-3).join(','), pstate.str(e.info) ]
      }
    }
  )
})

test('callback stop', function (t) {
  t.table_assert(
    [
      [ 'src',                'at_cb', 'ret', 'exp' ],
      [ '{ "a": 7, "b": 4 }', 0,       false, [ '(@0',                        83, '0/0:18/-' ] ],
      [ '{ "a": 7, "b": 4 }', 1,       false, [ '(@0,{@0',                    73,  '0/1:18/{-' ] ],
      [ '{ "a": 7, "b": 4 }', 2,       false, [ '(@0,{@0,k3@2:d1@7',          73,  '1/8:18/{.' ] ],
      [ '{ "a": 7, "b": 4 }', 3,       false, [ '{@0,k3@2:d1@7,k3@10:d1@15',  73,  '2/16:18/{.' ] ],
      // note that if callback returns false when parsing is done the info still has a '. code (but no END callback).
      [ '{ "a": 7, "b": 4 }', 4,       false, [ 'k3@2:d1@7,k3@10:d1@15,}@17', ')',       '3/18:18/.' ] ],
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
      return [ hector.arg(0).slice(-3).join(','), info.tok, pstate.str(info) ]
    }
  )
})

// completed parsing returns null and TOK.END callback info is null.
test('incremental clean',         function (t) {
  t.table_assert(
    [
      [ 'input',                  'exp'                                        ],
      [ '',                       [ '(@0,)@0',                ')', '0/0:0/-' ] ],
      [ '3.23e12',                [ '(@0,d7@0,)@7',           ')', '0/7:7/.' ] ],
      [ '"abc"',                  [ '(@0,s5@0,)@5',           ')', '1/5:5/.' ] ],
      [ '[ 83 ]',                 [ 'd2@2,]@5,)@6',           ')', '2/6:6/.' ] ],
      [ '[ 83, "a" ]',            [ 's3@6,]@10,)@11',         ')', '3/11:11/.' ] ],
      [ '{ "a": 3 }',             [ 'k3@2:d1@7,}@9,)@10',     ')', '2/10:10/.' ] ],
      [ '{ "a": 3, "b": 8 }',     [ 'k3@10:d1@15,}@17,)@18',  ')', '3/18:18/.' ] ],
      [ '{ "a": 3, "b": [1,2] }', [ ']@19,}@21,)@22',         ')', '5/22:22/.' ] ],
      [ 'null',                   [ '(@0,n@0,)@4',            ')', '1/4:4/.' ] ],
      [ ' 7E4 ',                  [ '(@0,d3@1,)@5',           ')', '1/5:5/.' ] ],
      [ '{ "a": 93, "b": [] }',   [ ']@17,}@19,)@20',         ')', '3/20:20/.' ] ],
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

      return [ hector.arg(0).slice(-3).join(','), info.tok, pstate.str(info) ]
    }
  )
})

test('incremental', function (t) {
  t.table_assert(
    [
      [ 'input'              ,  'exp' ],
      [ '"abc", '            ,  [ '(@0,s5@0,)@7',              73, '1/7:7/+' ] ],
      [ '['                  ,  [ '(@0,[@0,)@1',               73, '0/1:1/[-' ] ],
      [ '[ 83 '              ,  [ '[@0,d2@2,)@5',              73, '1/5:5/[.' ] ],
      [ '[ 83 ,'             ,  [ '[@0,d2@2,)@6',              73, '1/6:6/[+' ] ],
      [ '[ 83 , "a"'         ,  [ 'd2@2,s3@7,)@10',            73, '2/10:10/[.' ] ],
      [ '[ 83 , "a",'        ,  [ 'd2@2,s3@7,)@11',            73, '2/11:11/[+' ] ],
      [ '[ 83 , "a", 2'      ,  [ 'd2@2,s3@7,)1@12',           84, '2/13:13/[1' ] ],
      [ '{'                  ,  [ '(@0,{@0,)@1',               73, '0/1:1/{-' ] ],
      [ '{ "a"'              ,  [ '(@0,{@0,k3@2:)@5',          73, '0/5:5/{3.' ] ],
      [ '{ "a":'             ,  [ '(@0,{@0,k3@2:)@6',          73, '0/6:6/{3:' ] ],
      [ '{ "a": 9'           ,  [ '(@0,{@0,k3@2:)1@7',         84, '0/8:8/{3.1:1' ] ],
      [ '{ "a": 93, '        ,  [ '{@0,k3@2:d2@7,)@11',        73, '1/11:11/{+' ] ],
      [ '{ "a": 93, "b'      ,  [ '{@0,k3@2:d2@7,)2@11',       84, '1/13:13/{2' ] ],
      [ '{ "a": 93, "b"'     ,  [ '{@0,k3@2:d2@7,k3@11:)@14',  73, '1/14:14/{3.' ] ],
      [ '{ "a": 93, "b":'    ,  [ '{@0,k3@2:d2@7,k3@11:)@15',  73, '1/15:15/{3:' ] ],
      [ '{ "a": 93, "b": ['  ,  [ 'k3@2:d2@7,k3@11:[@16,)@17', 73, '1/17:17/{[-' ] ],
      [ '{ "a": 93, "b": []' ,  [ 'k3@11:[@16,]@17,)@18',      73, '2/18:18/{.' ] ],
      [ '{ "a": 93, "b": [] ',  [ 'k3@11:[@16,]@17,)@19',      73, '2/19:19/{.' ] ],
      [ '{ "a": 93, "b": [] }', [ ']@17,}@19,)@20',            ')', '3/20:20/.' ] ],
    ],
    function (src) {
      var hector = t.hector()
      var endinfo = null
      var cb = function (src, koff, klim, tok, voff, vlim, info) {
        hector(pstate.args2str(arguments))
        if (info && tok !== TOK.BEG) { endinfo = info }
        return true
      }
      var info = jtok.tokenize(utf8.buffer(src), {incremental: true}, cb)
      info === endinfo || err('expected returned info to equal endinfo')

      return [ hector.arg(0).slice(-3).join(','), info.tok, pstate.str(info) ]
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