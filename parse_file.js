var Transform = require('stream').Transform
var util = require('util')
var fs = require('fs')

var jtok = require('.')

function TokTransform(tokcb, stream_opt) {
    this.tokcb = tokcb
    this.state = {
        src: null,
        off: 0,
        lim: 0,
        lines: 0,                   // number of lines processed (\n or \n\r) (updated after src chunk is done),
        bytes: 0,                   // total bytes processed (updated after src chunk is done)
        buffers: 0,                 // total number of buffers processed
    }
    Transform.call(this, stream_opt)
}

TokTransform.prototype = {
    constructor: TokTransform,
    _transform: function (src, enc, cb) {
        if (src && src.length) {
            jtok.tokenize({src: src}, null, this.tokcb)
            this.state.bytes += src.length
            cb()
        }
        else {
            // console.log('chunk 0')
        }
    },
    _flush: function (cb) {
        this._transform(new Uint8Array(0), '', cb)
    }
}
util.inherits(TokTransform, Transform)


function parse_file (path, tokcb, stream_opt) {
    var inp = fs.createReadStream(path, stream_opt)
    var scantran = new TokTransform(tokcb, stream_opt)

    inp.pipe(scantran).pipe(process.stdout)
}

var tok_count = 0
var t0
var tokcb = function (ps) {
    switch (ps.tok) {
        case 66: //TOK.BEG:
            t0 = new Date()
            break
        case 69: // TOK.END:
            console.log('callback end', (new Date() - t0)/1000, { tok_count: tok_count })
            break
        default:
            tok_count++
    }
    return true
}
// var tok_count = 0
// var t0
// var tokcb = function (src, rcount, results, info) {
//     if (rcount === 1) {
//         if (results[2] === TOK.BEG) {
//             t0 = new Date()
//         } else if (results[2] === TOK.END) {
//             console.log('callback end', (new Date() - t0)/1000, { tok_count: tok_count })
//         } else {
//             tok_count++
//         }
//     } else {
//         tok_count += rcount
//     }
// }


// parse_file('../package.json', cb, { highWaterMark: 1024 * 1000000 })
parse_file('/Users/dad/dev/qzip/cache_150mb.json', tokcb, { highWaterMark: 1024 * 1000000 })
// parse_file('/Users/dad/dev/qb1-scan-sampler/samples/blockchain_unconfirmed.json', cb, { highWaterMark: 1024 * 1000000 })